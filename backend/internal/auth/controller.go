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

	// Email verification and password reset — public by design, they are how
	// a user proves (or recovers) an account before authenticating.
	rg.POST("/auth/otp/send", ct.sendOTP)
	rg.POST("/auth/otp/verify", ct.verifyOTP)
	rg.POST("/auth/password/forgot", ct.forgotPassword)
	rg.POST("/auth/password/reset", ct.resetPassword)
	rg.GET("/auth/meta", ct.authMeta)

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
		"id":            u.ID,
		"name":          u.Name,
		"email":         u.Email,
		"phone":         u.Phone,
		"bmoniUserId":   u.BMoniUserID,
		"createdAt":     u.CreatedAt,
		"emailVerified": u.EmailVerified,
		"locale":        u.Locale,
	}
}

// sendOTP emails a verification code (sign-up or password-reset purpose).
func (ct *Controller) sendOTP(c *gin.Context) {
	var req SendOTPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "INVALID_BODY", err.Error())
		return
	}
	purpose := req.Purpose
	if purpose == "" {
		purpose = models.CodePurposeSignup
	}
	var (
		resp *SendOTPResponse
		err  error
	)
	if purpose == models.CodePurposeReset {
		resp, err = ct.svc.RequestPasswordReset(c.Request.Context(), req.Email)
	} else {
		resp, err = ct.svc.SendVerification(c.Request.Context(), req.Email)
	}
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "OTP_FAILED", err.Error())
		return
	}
	response.OK(c, resp)
}

// verifyOTP consumes a sign-up code and marks the address verified.
func (ct *Controller) verifyOTP(c *gin.Context) {
	var req VerifyOTPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "INVALID_BODY", err.Error())
		return
	}
	user, err := ct.svc.VerifyEmail(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, ErrInvalidCode) {
			response.Error(c, http.StatusBadRequest, "INVALID_CODE", err.Error())
			return
		}
		response.Error(c, http.StatusInternalServerError, "VERIFY_FAILED", err.Error())
		return
	}
	response.OK(c, VerifyOTPResponse{Verified: true, User: publicUser(user)})
}

// forgotPassword mails a reset code. It always reports success so the
// endpoint cannot be used to test which emails have accounts.
func (ct *Controller) forgotPassword(c *gin.Context) {
	var req ForgotPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "INVALID_BODY", err.Error())
		return
	}
	resp, err := ct.svc.RequestPasswordReset(c.Request.Context(), req.Email)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "RESET_FAILED", err.Error())
		return
	}
	response.OK(c, resp)
}

// resetPassword sets a new password using the emailed code.
func (ct *Controller) resetPassword(c *gin.Context) {
	var req ResetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "INVALID_BODY", err.Error())
		return
	}
	if err := ct.svc.ResetPassword(c.Request.Context(), req); err != nil {
		if errors.Is(err, ErrInvalidCode) {
			response.Error(c, http.StatusBadRequest, "INVALID_CODE", err.Error())
			return
		}
		response.Error(c, http.StatusInternalServerError, "RESET_FAILED", err.Error())
		return
	}
	response.OK(c, gin.H{"reset": true})
}

// authMeta tells the client whether email is really delivered (SMTP) or only
// logged, so the UI can explain where to find the code in a demo deployment.
func (ct *Controller) authMeta(c *gin.Context) {
	response.OK(c, gin.H{
		"emailMode":      map[bool]string{true: "log", false: "smtp"}[ct.svc.mail.IsLog()],
		"codeTtlMinutes": CodeTTLMinutes,
	})
}
