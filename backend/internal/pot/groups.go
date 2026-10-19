package pot

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/odiliemmmanuel/campuspot/internal/bmoni"
	"github.com/odiliemmmanuel/campuspot/internal/models"
)

// CreateGroupRequest is the body for creating a pot.
type CreateGroupRequest struct {
	Name              string `json:"name" binding:"required,min=2"`
	PotType           string `json:"potType"` // goal | rotating
	ContributionFrequency string `json:"contributionFrequency"` // one_time | daily | weekly | monthly | quarterly
	ContributionDueDate *FlexTime `json:"contributionDueDate"`
	ApprovalThreshold int    `json:"approvalThreshold"` // defaults to 2
	ApprovalTotal     int    `json:"approvalTotal"`     // defaults to 3
	LargeExpenseKobo  int64  `json:"largeExpenseKobo"`  // 0 = no soft limit
	// PerMemberKobo is the amount every member pays in. When > 0 the pot opens
	// with a matching levy, so the collection target is per-member × members.
	PerMemberKobo int64 `json:"perMemberKobo"`
}

// CreateGroup creates a pot, makes the caller its treasurer, and provisions
// the B Moni smart wallet plus virtual Naira account that members pay into.
func (s *Service) CreateGroup(ctx context.Context, treasurerID uuid.UUID, req CreateGroupRequest) (*models.Group, error) {
	var treasurer models.User
	if err := s.db.First(&treasurer, "id = ?", treasurerID).Error; err != nil {
		return nil, ErrNotFound
	}

	if req.ApprovalThreshold <= 0 {
		req.ApprovalThreshold = 2
	}
	if req.PotType == "" {
		req.PotType = "goal"
	}
	if req.PotType != "goal" && req.PotType != "rotating" {
		return nil, fmt.Errorf("%w: pot type must be goal or rotating", ErrInvalid)
	}
	if req.ContributionFrequency == "" {
		if req.PotType == "goal" {
			req.ContributionFrequency = "one_time"
		} else {
			req.ContributionFrequency = "weekly"
		}
	}
	validFrequency := map[string]bool{"one_time": true, "daily": true, "weekly": true, "monthly": true, "quarterly": true}
	if !validFrequency[req.ContributionFrequency] || (req.PotType == "goal" && req.ContributionFrequency != "one_time") || (req.PotType == "rotating" && req.ContributionFrequency == "one_time") {
		return nil, fmt.Errorf("%w: contribution frequency does not match pot type", ErrInvalid)
	}
	if req.PerMemberKobo <= 0 {
		return nil, fmt.Errorf("%w: contribution amount must be greater than zero", ErrInvalid)
	}
	var contributionDueDate *time.Time
	if req.ContributionDueDate != nil && !req.ContributionDueDate.Time().IsZero() {
		due := req.ContributionDueDate.Time()
		contributionDueDate = &due
	}
	if contributionDueDate == nil {
		return nil, fmt.Errorf("%w: contribution deadline is required", ErrInvalid)
	}
	if contributionDueDate.UTC().Format("2006-01-02") < s.now().UTC().Format("2006-01-02") {
		return nil, fmt.Errorf("%w: contribution deadline must be today or later", ErrInvalid)
	}
	if req.ApprovalTotal <= 0 {
		req.ApprovalTotal = 3
	}
	if req.ApprovalThreshold > req.ApprovalTotal {
		return nil, fmt.Errorf("%w: approval threshold cannot exceed total approvers", ErrInvalid)
	}

	group := &models.Group{
		Name:              req.Name,
		PotType:           req.PotType,
		ContributionFrequency: req.ContributionFrequency,
		ContributionAmountKobo: req.PerMemberKobo,
		ContributionDueDate: contributionDueDate,
		Currency:          "NGN",
		CreatedBy:         treasurerID,
		ApprovalThreshold: req.ApprovalThreshold,
		ApprovalTotal:     req.ApprovalTotal,
		LargeExpenseKobo:  req.LargeExpenseKobo,
		BMoniUserID:       treasurer.BMoniUserID,
	}

	for i := 0; i < 5; i++ {
		code, err := generateJoinCode()
		if err != nil {
			return nil, err
		}
		group.JoinCode = code
		if err := s.db.Create(group).Error; err == nil {
			break
		} else if !isUniqueViolation(err) || i == 4 {
			return nil, err
		}
	}

	// Provision the wallet + NUBAN now that the group row (and its id) exists.
	// Best-effort: a sandbox hiccup must not stop the group existing.
	if treasurer.BMoniUserID != "" {
		if err := s.provisionAccount(ctx, group); err != nil {
			log.Printf("pot: provisioning group %s failed: %v", group.Name, err)
		}
	}

	m := &models.Membership{
		GroupID:   group.ID,
		UserID:    treasurerID,
		Role:      models.RoleTreasurer,
		Status:    models.MembershipActive,
		Reference: memberReference(group.JoinCode, treasurerID),
		JoinedAt:  timeNowPtr(),
	}
	if err := s.db.Create(m).Error; err != nil {
		return nil, err
	}

	// A pot starts empty. If the creator set an amount each member pays, open a
	// matching levy so the collection target (amount × joined members) is ready
	// the moment people start joining.
	if req.PerMemberKobo > 0 {
		levy := &models.Levy{
			GroupID:    group.ID,
			Title:      "Member dues",
			AmountKobo: req.PerMemberKobo,
			Status:     "open",
			CreatedBy:  treasurerID,
			DueDate:    contributionDueDate,
		}
		if err := s.db.Create(levy).Error; err != nil {
			return nil, err
		}
	}

	return group, nil
}

// provisionAccount creates the smart wallet and activates the Nigerian rail,
// then stores the NUBAN on the group.
func (s *Service) provisionAccount(ctx context.Context, group *models.Group) error {
	ownerAddr := "0x" + shortRef(group.ID) + "0000000000000000000000000000000000000000"
	ownerAddr = ownerAddr[:42]

	wallet, err := s.bmoni.CreateWallet(ctx, bmoni.CreateWalletRequest{
		BMoniUserID:      group.BMoniUserID,
		Currency:         "CNGN",
		UserOwnerAddress: ownerAddr,
	})
	if err != nil {
		return err
	}
	group.BMoniWalletID = wallet.ID
	group.BMoniWalletAddress = wallet.Address

	on, err := s.bmoni.StartNigeriaOnboarding(ctx, bmoni.NigeriaOnboardingRequest{
		BMoniUserID:   group.BMoniUserID,
		BVN:           sandboxBVN,
		WalletAddress: wallet.Address,
		WalletIndex:   0,
	})
	if err != nil {
		return err
	}
	group.VirtualAccountNumber = on.VirtualAccountNumber
	group.VirtualAccountBank = on.BankName
	group.VirtualAccountName = on.AccountName

	return s.db.Model(group).Updates(map[string]interface{}{
		"b_moni_wallet_id":       group.BMoniWalletID,
		"b_moni_wallet_address":  group.BMoniWalletAddress,
		"virtual_account_number": group.VirtualAccountNumber,
		"virtual_account_bank":   group.VirtualAccountBank,
		"virtual_account_name":   group.VirtualAccountName,
	}).Error
}

// ListMyGroups returns every group the caller belongs to.
func (s *Service) ListMyGroups(_ context.Context, userID uuid.UUID) ([]models.Group, error) {
	var groups []models.Group
	err := s.db.
		Joins("JOIN memberships m ON m.group_id = groups.id").
		Where("m.user_id = ? AND m.status = ?", userID, models.MembershipActive).
		Order("groups.created_at DESC").
		Find(&groups).Error
	return groups, err
}

// GetGroup returns a group the caller belongs to.
func (s *Service) GetGroup(_ context.Context, groupID, userID uuid.UUID) (*models.Group, error) {
	if _, err := s.requireMember(groupID, userID); err != nil {
		return nil, err
	}
	var group models.Group
	if err := s.db.First(&group, "id = ?", groupID).Error; err != nil {
		return nil, ErrNotFound
	}
	return &group, nil
}

// GroupByBMoniUser resolves the group whose wallet is owned by the given
// B Moni user id. Deposit webhooks carry only that id, so this is how an
// incoming payment finds its pot.
func (s *Service) GroupByBMoniUser(_ context.Context, bmoniUserID string) (*models.Group, error) {
	if bmoniUserID == "" {
		return nil, ErrNotFound
	}
	var group models.Group
	err := s.db.Where("b_moni_user_id = ?", bmoniUserID).Order("created_at ASC").First(&group).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &group, nil
}

// InviteMemberRequest invites a user (by id or email) into the group.
type InviteMemberRequest struct {
	Email string      `json:"email"`
	Role  models.Role `json:"role"` // cosigner | member
}

// Invite adds a membership (invited) for a user. Treasurer only.
func (s *Service) Invite(_ context.Context, groupID, actorID uuid.UUID, req InviteMemberRequest) (*models.Membership, error) {
	if _, err := s.requireRole(groupID, actorID, models.RoleTreasurer); err != nil {
		return nil, err
	}
	if req.Role == "" {
		req.Role = models.RoleMember
	}
	if req.Role != models.RoleMember && req.Role != models.RoleCosigner {
		return nil, fmt.Errorf("%w: role must be member or cosigner", ErrInvalid)
	}

	var user models.User
	if err := s.db.First(&user, "email = ?", req.Email).Error; err != nil {
		return nil, fmt.Errorf("%w: no user with that email", ErrNotFound)
	}

	var group models.Group
	if err := s.db.First(&group, "id = ?", groupID).Error; err != nil {
		return nil, ErrNotFound
	}

	m := &models.Membership{
		GroupID:   groupID,
		UserID:    user.ID,
		Role:      req.Role,
		Status:    models.MembershipInvited,
		Reference: memberReference(group.JoinCode, user.ID),
	}
	if err := s.db.Create(m).Error; err != nil {
		if isUniqueViolation(err) {
			return nil, fmt.Errorf("%w: user is already in this group", ErrConflict)
		}
		return nil, err
	}
	return m, nil
}

// UpdateGroupRequest edits a pot's settings. Pointers let the treasurer change
// one field without resending the rest; LargeExpenseKobo uses a pointer so that
// 0 (no soft limit) is a valid, explicit value.
type UpdateGroupRequest struct {
	Name              *string `json:"name"`
	ApprovalThreshold *int    `json:"approvalThreshold"`
	ApprovalTotal     *int    `json:"approvalTotal"`
	LargeExpenseKobo  *int64  `json:"largeExpenseKobo"`
}

// UpdateGroup changes a pot's name and spending rules. Treasurer only.
func (s *Service) UpdateGroup(_ context.Context, groupID, actorID uuid.UUID, req UpdateGroupRequest) (*models.Group, error) {
	if _, err := s.requireRole(groupID, actorID, models.RoleTreasurer); err != nil {
		return nil, err
	}
	var group models.Group
	if err := s.db.First(&group, "id = ?", groupID).Error; err != nil {
		return nil, ErrNotFound
	}

	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if len(name) < 2 {
			return nil, fmt.Errorf("%w: name must be at least 2 characters", ErrInvalid)
		}
		group.Name = name
	}
	if req.ApprovalThreshold != nil {
		group.ApprovalThreshold = *req.ApprovalThreshold
	}
	if req.ApprovalTotal != nil {
		group.ApprovalTotal = *req.ApprovalTotal
	}
	if req.LargeExpenseKobo != nil {
		group.LargeExpenseKobo = *req.LargeExpenseKobo
	}

	if group.ApprovalThreshold <= 0 || group.ApprovalTotal <= 0 {
		return nil, fmt.Errorf("%w: approval rules must be positive", ErrInvalid)
	}
	if group.ApprovalThreshold > group.ApprovalTotal {
		return nil, fmt.Errorf("%w: approval threshold cannot exceed total approvers", ErrInvalid)
	}

	if err := s.db.Save(&group).Error; err != nil {
		return nil, err
	}
	return &group, nil
}

// RegenerateJoinCode issues a fresh join code for a pot. The old code stops
// working immediately; references already handed out to existing members keep
// working because they are stored per membership. Treasurer only.
func (s *Service) RegenerateJoinCode(_ context.Context, groupID, actorID uuid.UUID) (*models.Group, error) {
	if _, err := s.requireRole(groupID, actorID, models.RoleTreasurer); err != nil {
		return nil, err
	}
	var group models.Group
	if err := s.db.First(&group, "id = ?", groupID).Error; err != nil {
		return nil, ErrNotFound
	}
	for i := 0; i < 5; i++ {
		code, err := generateJoinCode()
		if err != nil {
			return nil, err
		}
		group.JoinCode = code
		if err := s.db.Save(&group).Error; err == nil {
			return &group, nil
		} else if !isUniqueViolation(err) {
			return nil, err
		}
	}
	return nil, fmt.Errorf("%w: could not generate a unique join code", ErrConflict)
}

// UpdateRoleRequest changes a member's role within a pot.
type UpdateRoleRequest struct {
	Role models.Role `json:"role"`
}

// UpdateMemberRole lets a treasurer promote or demote another member — e.g.
// turning someone who joined with the code into a co-signer. Treasurer only,
// and the pot always keeps at least one treasurer.
func (s *Service) UpdateMemberRole(_ context.Context, groupID, actorID, targetUserID uuid.UUID, role models.Role) (*models.Membership, error) {
	if _, err := s.requireRole(groupID, actorID, models.RoleTreasurer); err != nil {
		return nil, err
	}
	if role != models.RoleMember && role != models.RoleCosigner && role != models.RoleTreasurer {
		return nil, fmt.Errorf("%w: role must be member, cosigner or treasurer", ErrInvalid)
	}

	var m models.Membership
	if err := s.db.Where("group_id = ? AND user_id = ?", groupID, targetUserID).First(&m).Error; err != nil {
		return nil, ErrNotFound
	}

	// Never let the last treasurer step down — that would lock the pot.
	if m.Role == models.RoleTreasurer && role != models.RoleTreasurer {
		var treasurers int64
		if err := s.db.Model(&models.Membership{}).
			Where("group_id = ? AND role = ? AND status = ?", groupID, models.RoleTreasurer, models.MembershipActive).
			Count(&treasurers).Error; err != nil {
			return nil, err
		}
		if treasurers <= 1 {
			return nil, fmt.Errorf("%w: the pot must keep at least one treasurer", ErrInvalid)
		}
	}

	m.Role = role
	if err := s.db.Save(&m).Error; err != nil {
		return nil, err
	}
	return &m, nil
}

// Leave removes the caller from a pot. Chat access follows the membership, so
// leaving also drops the person out of the pot chat. The pot must keep at least
// one treasurer, so the last treasurer cannot simply walk away.
func (s *Service) Leave(_ context.Context, groupID, userID uuid.UUID) error {
	m, err := s.requireMember(groupID, userID)
	if err != nil {
		return err
	}
	if m.Role == models.RoleTreasurer {
		var treasurers int64
		if err := s.db.Model(&models.Membership{}).
			Where("group_id = ? AND role = ? AND status = ?", groupID, models.RoleTreasurer, models.MembershipActive).
			Count(&treasurers).Error; err != nil {
			return err
		}
		if treasurers <= 1 {
			return fmt.Errorf("%w: the pot must keep at least one treasurer — promote someone before leaving", ErrInvalid)
		}
	}
	return s.db.Model(&models.Membership{}).
		Where("group_id = ? AND user_id = ?", groupID, userID).
		Update("status", models.MembershipRemoved).Error
}

// Join turns a join code into an active membership.
func (s *Service) Join(_ context.Context, userID uuid.UUID, joinCode string) (*models.Group, error) {
	var group models.Group
	if err := s.db.First(&group, "join_code = ?", joinCode).Error; err != nil {
		return nil, fmt.Errorf("%w: no group with that join code", ErrNotFound)
	}

	var m models.Membership
	err := s.db.Where("group_id = ? AND user_id = ?", group.ID, userID).First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		m = models.Membership{
			GroupID:   group.ID,
			UserID:    userID,
			Role:      models.RoleMember,
			Reference: memberReference(group.JoinCode, userID),
		}
	} else if err != nil {
		return nil, err
	}
	m.Status = models.MembershipActive
	m.JoinedAt = timeNowPtr()
	if err := s.db.Save(&m).Error; err != nil {
		return nil, err
	}
	return &group, nil
}

// ListMembers returns memberships with their user records.
func (s *Service) ListMembers(_ context.Context, groupID, actorID uuid.UUID) ([]models.Membership, error) {
	if _, err := s.requireMember(groupID, actorID); err != nil {
		return nil, err
	}
	var members []models.Membership
	err := s.db.Preload("User").Where("group_id = ?", groupID).Order("created_at ASC").Find(&members).Error
	return members, err
}

// requireMember is requireRole for any active member.
func (s *Service) requireMember(groupID, userID uuid.UUID) (*models.Membership, error) {
	return s.requireRole(groupID, userID,
		models.RoleTreasurer, models.RoleCosigner, models.RoleMember)
}

func isUniqueViolation(err error) bool {
	return err != nil && (errors.Is(err, gorm.ErrDuplicatedKey) ||
		strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "UNIQUE"))
}
