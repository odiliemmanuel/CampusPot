package pot

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/odiliemmmanuel/campuspot/common/response"
	"github.com/odiliemmmanuel/campuspot/internal/auth"
)

// Controller exposes the pot engine over HTTP.
type Controller struct {
	svc *Service
}

// NewController builds the controller.
func NewController(svc *Service) *Controller { return &Controller{svc: svc} }

// RegisterRoutes attaches all pot routes to an authenticated group.
func (ct *Controller) RegisterRoutes(rg *gin.RouterGroup) {
	g := rg.Group("/groups")
	g.POST("", ct.createGroup)
	g.GET("", ct.listGroups)
	g.POST("/join", ct.joinGroup)
	g.GET("/:id", ct.getGroup)
	g.POST("/:id/invite", ct.invite)
	g.GET("/:id/members", ct.listMembers)

	g.POST("/:id/levies", ct.createLevy)
	g.GET("/:id/levies", ct.listLevies)
	g.POST("/:id/levies/:levyId/close", ct.closeLevy)

	g.GET("/:id/payments", ct.listPayments)
	g.POST("/:id/payments/manual", ct.recordManualPayment)
	g.POST("/:id/deposits", ct.simulateDeposit)
	g.GET("/:id/ledger", ct.listLedger)

	g.POST("/:id/expenses", ct.createExpense)
	g.GET("/:id/expenses", ct.listExpenses)
	g.POST("/:id/expenses/:expenseId/decisions", ct.decide)
	g.GET("/:id/expenses/:expenseId/approvals", ct.listApprovals)
	g.POST("/:id/expenses/:expenseId/execute", ct.executeExpense)

	g.GET("/:id/summary", ct.summary)
	g.GET("/:id/outstanding", ct.outstanding)
}

func (ct *Controller) createGroup(c *gin.Context) {
	var req CreateGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "INVALID_BODY", err.Error())
		return
	}
	group, err := ct.svc.CreateGroup(c.Request.Context(), auth.MustUserID(c), req)
	if err != nil {
		respondErr(c, err)
		return
	}
	response.Created(c, group)
}

func (ct *Controller) listGroups(c *gin.Context) {
	groups, err := ct.svc.ListMyGroups(c.Request.Context(), auth.MustUserID(c))
	if err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, groups)
}

func (ct *Controller) getGroup(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	group, err := ct.svc.GetGroup(c.Request.Context(), groupID, auth.MustUserID(c))
	if err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, group)
}

func (ct *Controller) joinGroup(c *gin.Context) {
	var req struct {
		JoinCode string `json:"joinCode" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "INVALID_BODY", err.Error())
		return
	}
	group, err := ct.svc.Join(c.Request.Context(), auth.MustUserID(c), req.JoinCode)
	if err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, group)
}

func (ct *Controller) invite(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	var req InviteMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "INVALID_BODY", err.Error())
		return
	}
	m, err := ct.svc.Invite(c.Request.Context(), groupID, auth.MustUserID(c), req)
	if err != nil {
		respondErr(c, err)
		return
	}
	response.Created(c, m)
}

func (ct *Controller) listMembers(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	members, err := ct.svc.ListMembers(c.Request.Context(), groupID, auth.MustUserID(c))
	if err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, members)
}

func (ct *Controller) createLevy(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	var req CreateLevyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "INVALID_BODY", err.Error())
		return
	}
	levy, err := ct.svc.CreateLevy(c.Request.Context(), groupID, auth.MustUserID(c), req)
	if err != nil {
		respondErr(c, err)
		return
	}
	response.Created(c, levy)
}

func (ct *Controller) listLevies(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	levies, err := ct.svc.ListLevies(c.Request.Context(), groupID, auth.MustUserID(c))
	if err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, levies)
}

func (ct *Controller) closeLevy(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	levyID, ok := pathID(c, "levyId")
	if !ok {
		return
	}
	if err := ct.svc.CloseLevy(c.Request.Context(), groupID, levyID, auth.MustUserID(c)); err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, gin.H{"status": "closed"})
}

func (ct *Controller) listPayments(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	payments, err := ct.svc.ListPayments(c.Request.Context(), groupID, auth.MustUserID(c))
	if err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, payments)
}

func (ct *Controller) recordManualPayment(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	var req RecordManualPaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "INVALID_BODY", err.Error())
		return
	}
	payment, err := ct.svc.RecordManualPayment(c.Request.Context(), groupID, auth.MustUserID(c), req)
	if err != nil {
		respondErr(c, err)
		return
	}
	response.Created(c, payment)
}

// simulateDeposit lets the demo drive a deposit without the sandbox webhook.
// It uses the exact same reconciliation path as the real webhook.
func (ct *Controller) simulateDeposit(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	var req struct {
		AmountKobo      int64      `json:"amountKobo" binding:"required,gt=0"`
		Reference       string     `json:"reference"`
		PayerName       string     `json:"payerName"`
		PayerAccount    string     `json:"payerAccount"`
		LevyID          *uuid.UUID `json:"levyId"`
		ProviderEventID string     `json:"providerEventId"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "INVALID_BODY", err.Error())
		return
	}
	payment, err := ct.svc.ReconcileDeposit(c.Request.Context(), DepositEvent{
		GroupID:         groupID,
		LevyID:          req.LevyID,
		AmountKobo:      req.AmountKobo,
		QuotedReference: req.Reference,
		PayerName:       req.PayerName,
		PayerAccount:    req.PayerAccount,
		ProviderEventID: req.ProviderEventID,
	})
	if err != nil {
		respondErr(c, err)
		return
	}
	response.Created(c, payment)
}

func (ct *Controller) listLedger(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	entries, err := ct.svc.ListLedger(c.Request.Context(), groupID, auth.MustUserID(c))
	if err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, entries)
}

func (ct *Controller) createExpense(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	var req CreateExpenseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "INVALID_BODY", err.Error())
		return
	}
	expense, err := ct.svc.CreateExpense(c.Request.Context(), groupID, auth.MustUserID(c), req)
	if err != nil {
		respondErr(c, err)
		return
	}
	response.Created(c, expense)
}

func (ct *Controller) listExpenses(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	expenses, err := ct.svc.ListExpenses(c.Request.Context(), groupID, auth.MustUserID(c))
	if err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, expenses)
}

func (ct *Controller) decide(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	expenseID, ok := pathID(c, "expenseId")
	if !ok {
		return
	}
	var req DecisionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "INVALID_BODY", err.Error())
		return
	}
	expense, err := ct.svc.Approve(c.Request.Context(), groupID, expenseID, auth.MustUserID(c), req)
	if err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, expense)
}

func (ct *Controller) listApprovals(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	expenseID, ok := pathID(c, "expenseId")
	if !ok {
		return
	}
	approvals, err := ct.svc.ListApprovals(c.Request.Context(), groupID, expenseID, auth.MustUserID(c))
	if err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, approvals)
}

func (ct *Controller) executeExpense(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	expenseID, ok := pathID(c, "expenseId")
	if !ok {
		return
	}
	expense, err := ct.svc.Execute(c.Request.Context(), groupID, expenseID, auth.MustUserID(c))
	if err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, expense)
}

func (ct *Controller) summary(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	if _, err := ct.svc.requireMember(groupID, auth.MustUserID(c)); err != nil {
		respondErr(c, err)
		return
	}
	sum, err := ct.svc.Summary(c.Request.Context(), groupID, nil)
	if err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, sum)
}

func (ct *Controller) outstanding(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	if _, err := ct.svc.requireMember(groupID, auth.MustUserID(c)); err != nil {
		respondErr(c, err)
		return
	}
	outstanding, levy, err := ct.svc.WhoHasntPaid(c.Request.Context(), groupID, nil)
	if err != nil {
		respondErr(c, err)
		return
	}
	response.WithMeta(c, outstanding, gin.H{"levy": levy})
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
	case errors.Is(err, ErrNotFound):
		response.Error(c, http.StatusNotFound, "NOT_FOUND", err.Error())
	case errors.Is(err, ErrForbidden):
		response.Error(c, http.StatusForbidden, "FORBIDDEN", "you do not have access to this action")
	case errors.Is(err, ErrConflict):
		response.Error(c, http.StatusConflict, "CONFLICT", err.Error())
	case errors.Is(err, ErrInvalid):
		response.Error(c, http.StatusBadRequest, "INVALID_REQUEST", err.Error())
	default:
		response.Error(c, http.StatusInternalServerError, "INTERNAL", err.Error())
	}
}
