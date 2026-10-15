package ai

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/odiliemmmanuel/campuspot/common/response"
	"github.com/odiliemmmanuel/campuspot/internal/auth"
	"github.com/odiliemmmanuel/campuspot/internal/pot"
)

// Controller exposes the AI treasurer over HTTP.
type Controller struct {
	svc *Service
}

// NewController builds the controller.
func NewController(svc *Service) *Controller { return &Controller{svc: svc} }

// RegisterRoutes attaches assistant and reminder routes.
func (ct *Controller) RegisterRoutes(rg *gin.RouterGroup) {
	g := rg.Group("/groups")
	g.POST("/:id/assistant", ct.assistant)
	g.POST("/:id/reminders", ct.draftReminder)
	g.GET("/:id/reminders", ct.listReminders)
	g.POST("/:id/reminders/:reminderId/send", ct.sendReminder)
}

func (ct *Controller) assistant(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	var req struct {
		Question string `json:"question" binding:"required,min=2"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "INVALID_BODY", err.Error())
		return
	}
	answer, err := ct.svc.Answer(c.Request.Context(), groupID, auth.MustUserID(c), req.Question)
	if err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, answer)
}

func (ct *Controller) draftReminder(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	var req struct {
		UserID uuid.UUID `json:"userId" binding:"required"`
		Tone   string    `json:"tone"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "INVALID_BODY", err.Error())
		return
	}
	reminder, err := ct.svc.DraftReminder(c.Request.Context(), groupID, auth.MustUserID(c), req.UserID, req.Tone)
	if err != nil {
		respondErr(c, err)
		return
	}
	response.Created(c, reminder)
}

func (ct *Controller) listReminders(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	reminders, err := ct.svc.ListReminders(c.Request.Context(), groupID, auth.MustUserID(c))
	if err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, reminders)
}

func (ct *Controller) sendReminder(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	reminderID, ok := pathID(c, "reminderId")
	if !ok {
		return
	}
	reminder, err := ct.svc.SendReminder(c.Request.Context(), groupID, reminderID, auth.MustUserID(c))
	if err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, reminder)
}

func pathID(c *gin.Context, name string) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Param(name))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "INVALID_ID", "invalid "+name)
		return uuid.Nil, false
	}
	return id, true
}

func respondErr(c *gin.Context, err error) {
	switch {
	case errors.Is(err, pot.ErrNotFound):
		response.Error(c, http.StatusNotFound, "NOT_FOUND", err.Error())
	case errors.Is(err, pot.ErrForbidden):
		response.Error(c, http.StatusForbidden, "FORBIDDEN", "you do not have access to this action")
	case errors.Is(err, pot.ErrConflict):
		response.Error(c, http.StatusConflict, "CONFLICT", err.Error())
	case errors.Is(err, pot.ErrInvalid):
		response.Error(c, http.StatusBadRequest, "INVALID_REQUEST", err.Error())
	default:
		response.Error(c, http.StatusInternalServerError, "INTERNAL", err.Error())
	}
}
