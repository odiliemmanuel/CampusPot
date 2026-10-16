package auth

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/odiliemmmanuel/campuspot/common/response"
	"github.com/odiliemmmanuel/campuspot/internal/models"
)

// Controller exposes auth HTTP routes.
type Controller struct {
	svc *Service
}

// NewController builds the controller.
func NewController(svc *Service) *Controller { return &Controller{svc: svc} }

// RegisterRoutes attaches auth routes under /auth.
func (ct *Controller) RegisterRoutes(rg *gin.RouterGroup) {
	rg.POST("/auth/register", ct.register)
	rg.POST("/auth/login", ct.login)

	authed := rg.Group("")
	authed.Use(ct.svc.RequireAuth())
	authed.GET("/auth/me", ct.me)
	authed.PATCH("/auth/me", ct.updateMe)
	authed.DELETE("/auth/me", ct.deleteMe)
}

func (ct *Controller) register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "INVALID_BODY", err.Error())
		return
	}
	user, token, err := ct.svc.Register(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, ErrEmailTaken) {
			response.Error(c, http.StatusConflict, "EMAIL_TAKEN", "that email is already registered")
			return
		}
		if errors.Is(err, ErrPhoneTaken) {
			response.Error(c, http.StatusConflict, "PHONE_TAKEN", "that phone number is already registered")
			return
		}
		if errors.Is(err, ErrPhoneRequired) {
			response.Error(c, http.StatusBadRequest, "PHONE_REQUIRED", "a phone number is required")
			return
		}
		response.Error(c, http.StatusInternalServerError, "REGISTER_FAILED", err.Error())
		return
	}
	response.Created(c, AuthResponse{Token: token, User: publicUser(user)})
}

func (ct *Controller) login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "INVALID_BODY", err.Error())
		return
	}
	user, token, err := ct.svc.Login(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, ErrInvalidCredentials) {
			response.Error(c, http.StatusUnauthorized, "INVALID_CREDENTIALS", "invalid email or password")
			return
		}
		response.Error(c, http.StatusInternalServerError, "LOGIN_FAILED", err.Error())
		return
	}
	response.OK(c, AuthResponse{Token: token, User: publicUser(user)})
}

func (ct *Controller) me(c *gin.Context) {
	var user models.User
	if err := ct.svc.db.First(&user, "id = ?", MustUserID(c)).Error; err != nil {
		response.Error(c, http.StatusNotFound, "USER_NOT_FOUND", "user not found")
		return
	}
	response.OK(c, publicUser(&user))
}

func (ct *Controller) updateMe(c *gin.Context) {
	var req UpdateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "INVALID_BODY", err.Error())
		return
	}
	user, err := ct.svc.UpdateProfile(c.Request.Context(), MustUserID(c), req)
	if err != nil {
		if errors.Is(err, ErrInvalidProfile) {
			response.Error(c, http.StatusBadRequest, "INVALID_PROFILE", "provide a name (2+ characters) or a phone number")
			return
		}
		response.Error(c, http.StatusInternalServerError, "UPDATE_FAILED", err.Error())
		return
	}
	response.OK(c, publicUser(user))
}

func (ct *Controller) deleteMe(c *gin.Context) {
	err := ct.svc.DeleteAccount(c.Request.Context(), MustUserID(c))
	if err != nil {
		if errors.Is(err, ErrSoleTreasurer) {
			response.Error(c, http.StatusConflict, "SOLE_TREASURER", err.Error())
			return
		}
		response.Error(c, http.StatusInternalServerError, "DELETE_FAILED", err.Error())
		return
	}
	response.OK(c, gin.H{"deleted": true})
}

// publicUser hides fields that must never leave the server (password hash).
func publicUser(u *models.User) gin.H {
	return gin.H{
		"id":          u.ID,
		"name":        u.Name,
		"email":       u.Email,
		"phone":       u.Phone,
		"bmoniUserId": u.BMoniUserID,
		"createdAt":   u.CreatedAt,
	}
}
