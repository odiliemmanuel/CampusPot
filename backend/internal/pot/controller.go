package pot

import (
	"errors"
	"fmt"
	"net/http"
	"path/filepath"

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
	g.PATCH("/:id", ct.updateGroup)
	g.POST("/:id/join-code", ct.regenerateJoinCode)
	g.POST("/:id/invite", ct.invite)
	g.GET("/:id/members", ct.listMembers)
	g.PATCH("/:id/members/:userId", ct.updateMemberRole)
	g.POST("/:id/leave", ct.leaveGroup)

	// Pot chat — every active member can read, post and reply; read receipts
	// are tracked per message.
	g.GET("/:id/chat", ct.listChat)
	g.POST("/:id/chat", ct.postChat)
	g.POST("/:id/chat/attachments", ct.uploadChatAttachment)
	g.GET("/:id/chat/:messageId/attachment", ct.getChatAttachment)
	g.POST("/:id/chat/read", ct.markChatRead)
	g.GET("/:id/chat/participants", ct.chatParticipants)
	g.DELETE("/:id/chat/members/:userId", ct.removeChatMember)

	// Member disputes — two or more open disputes freeze the treasurer's spending.
	g.GET("/:id/disputes", ct.listDisputes)
	g.POST("/:id/disputes", ct.raiseDispute)
	g.POST("/:id/disputes/:disputeId/resolve", ct.resolveDispute)

	g.GET("/:id/contributions", ct.contributions)

	g.POST("/:id/levies", ct.createLevy)
	g.GET("/:id/levies", ct.listLevies)
	g.POST("/:id/levies/:levyId/close", ct.closeLevy)
	g.DELETE("/:id/levies/:levyId", ct.deleteLevy)

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

	// A user's own cross-pot overview (Balance & History).
	rg.GET("/account/overview", ct.accountOverview)

	// The signed-in user's personal wallet.
	rg.GET("/wallet", ct.wallet)
	rg.POST("/wallet/deposit", ct.walletDeposit)
	rg.POST("/wallet/transfer", ct.walletTransfer)
	rg.POST("/wallet/pay", ct.walletPayPot)
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

func (ct *Controller) updateGroup(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	var req UpdateGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "INVALID_BODY", err.Error())
		return
	}
	group, err := ct.svc.UpdateGroup(c.Request.Context(), groupID, auth.MustUserID(c), req)
	if err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, group)
}

func (ct *Controller) regenerateJoinCode(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	group, err := ct.svc.RegenerateJoinCode(c.Request.Context(), groupID, auth.MustUserID(c))
	if err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, group)
}

func (ct *Controller) accountOverview(c *gin.Context) {
	ov, err := ct.svc.AccountOverview(c.Request.Context(), auth.MustUserID(c))
	if err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, ov)
}

func (ct *Controller) wallet(c *gin.Context) {
	ov, err := ct.svc.Wallet(c.Request.Context(), auth.MustUserID(c))
	if err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, ov)
}

func (ct *Controller) walletDeposit(c *gin.Context) {
	var req WalletDepositRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "INVALID_BODY", err.Error())
		return
	}
	ov, err := ct.svc.WalletDeposit(c.Request.Context(), auth.MustUserID(c), req)
	if err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, ov)
}

func (ct *Controller) walletTransfer(c *gin.Context) {
	var req WalletTransferRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "INVALID_BODY", err.Error())
		return
	}
	ov, err := ct.svc.WalletTransfer(c.Request.Context(), auth.MustUserID(c), req)
	if err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, ov)
}

func (ct *Controller) walletPayPot(c *gin.Context) {
	var req WalletPayRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "INVALID_BODY", err.Error())
		return
	}
	payment, err := ct.svc.WalletPayPot(c.Request.Context(), auth.MustUserID(c), req)
	if err != nil {
		respondErr(c, err)
		return
	}
	response.Created(c, payment)
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

func (ct *Controller) updateMemberRole(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	targetID, ok := pathID(c, "userId")
	if !ok {
		return
	}
	var req UpdateRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "INVALID_BODY", err.Error())
		return
	}
	m, err := ct.svc.UpdateMemberRole(c.Request.Context(), groupID, auth.MustUserID(c), targetID, req.Role)
	if err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, m)
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

func (ct *Controller) deleteLevy(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	levyID, ok := pathID(c, "levyId")
	if !ok {
		return
	}
	if err := ct.svc.DeleteLevy(c.Request.Context(), groupID, levyID, auth.MustUserID(c)); err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, gin.H{"status": "deleted"})
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

func (ct *Controller) leaveGroup(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	if err := ct.svc.Leave(c.Request.Context(), groupID, auth.MustUserID(c)); err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, gin.H{"status": "left"})
}

func (ct *Controller) contributions(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	res, err := ct.svc.Contributions(c.Request.Context(), groupID, auth.MustUserID(c))
	if err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, res)
}

func (ct *Controller) listChat(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	msgs, err := ct.svc.ListChat(c.Request.Context(), groupID, auth.MustUserID(c))
	if err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, msgs)
}

func (ct *Controller) postChat(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	var req PostChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "INVALID_BODY", err.Error())
		return
	}
	msg, err := ct.svc.PostChat(c.Request.Context(), groupID, auth.MustUserID(c), req)
	if err != nil {
		respondErr(c, err)
		return
	}
	response.Created(c, msg)
	chatBroadcast.publish(groupID, msg)
}

func (ct *Controller) uploadChatAttachment(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, (10<<20)+(1<<20))
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		response.Error(c, http.StatusBadRequest, "INVALID_FILE", "Choose a file to upload.")
		return
	}
	defer file.Close()
	msg, err := ct.svc.UploadChatAttachment(c.Request.Context(), groupID, auth.MustUserID(c), filepath.Base(header.Filename), header.Header.Get("Content-Type"), file)
	if err != nil {
		respondErr(c, err)
		return
	}
	chatBroadcast.publish(groupID, msg)
	response.Created(c, msg)
}

func (ct *Controller) getChatAttachment(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	messageID, ok := pathID(c, "messageId")
	if !ok {
		return
	}
	name, contentType, data, err := ct.svc.ChatAttachment(c.Request.Context(), groupID, auth.MustUserID(c), messageID)
	if err != nil {
		respondErr(c, err)
		return
	}
	c.Header("Content-Disposition", fmt.Sprintf("inline; filename=%q", name))
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(http.StatusOK, contentType, data)
}

func (ct *Controller) markChatRead(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	var req struct {
		MessageID uuid.UUID `json:"messageId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "INVALID_BODY", err.Error())
		return
	}
	if err := ct.svc.MarkChatRead(c.Request.Context(), groupID, auth.MustUserID(c), req.MessageID); err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, gin.H{"status": "read"})
}

func (ct *Controller) chatParticipants(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	members, err := ct.svc.ChatParticipants(c.Request.Context(), groupID, auth.MustUserID(c))
	if err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, members)
}

func (ct *Controller) removeChatMember(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	targetID, ok := pathID(c, "userId")
	if !ok {
		return
	}
	if err := ct.svc.RemoveChatMember(c.Request.Context(), groupID, auth.MustUserID(c), targetID); err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, gin.H{"status": "removed"})
}

func (ct *Controller) listDisputes(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	disputes, err := ct.svc.ListDisputes(c.Request.Context(), groupID, auth.MustUserID(c))
	if err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, disputes)
}

func (ct *Controller) raiseDispute(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	var req RaiseDisputeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "INVALID_BODY", err.Error())
		return
	}
	d, err := ct.svc.RaiseDispute(c.Request.Context(), groupID, auth.MustUserID(c), req)
	if err != nil {
		respondErr(c, err)
		return
	}
	response.Created(c, d)
}

func (ct *Controller) resolveDispute(c *gin.Context) {
	groupID, ok := pathID(c, "id")
	if !ok {
		return
	}
	disputeID, ok := pathID(c, "disputeId")
	if !ok {
		return
	}
	d, err := ct.svc.ResolveDispute(c.Request.Context(), groupID, disputeID, auth.MustUserID(c))
	if err != nil {
		respondErr(c, err)
		return
	}
	response.OK(c, d)
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
