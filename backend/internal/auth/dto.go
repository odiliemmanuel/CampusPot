package auth

// RegisterRequest is the JSON body for POST /api/v1/auth/register.
// ReferralCode is optional: when it matches another user's code that user is
// credited with the referral once the new account verifies its email.
type RegisterRequest struct {
	Name         string `json:"name" binding:"required,min=2"`
	Email        string `json:"email" binding:"required,email"`
	Phone        string `json:"phone" binding:"required,min=7"`
	Password     string `json:"password" binding:"required,min=6"`
	ReferralCode string `json:"referralCode"`
	Locale       string `json:"locale"`
}

// LoginRequest is the JSON body for POST /api/v1/auth/login.
type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// AuthResponse is returned on successful register/login.
type AuthResponse struct {
	Token string      `json:"token"`
	User  interface{} `json:"user"`
}

// UpdateProfileRequest is the JSON body for PATCH /api/v1/auth/me. All fields
// are optional; only the ones present are changed.
type UpdateProfileRequest struct {
	Name   *string `json:"name"`
	Phone  *string `json:"phone"`
	Locale *string `json:"locale"`
}

// SendOTPRequest asks for a verification code to be emailed. Purpose is
// "signup" (default) or "reset".
type SendOTPRequest struct {
	Email   string `json:"email" binding:"required,email"`
	Purpose string `json:"purpose"`
}

// SendOTPResponse acknowledges the request. DevCode is populated only when no
// SMTP server is configured (log-mode email) so the demo can complete the flow
// without real mail; it is never returned in production.
type SendOTPResponse struct {
	Sent    bool   `json:"sent"`
	Expires string `json:"expiresAt,omitempty"`
	DevCode string `json:"devCode,omitempty"`
}

// VerifyOTPRequest submits the code the user received.
type VerifyOTPRequest struct {
	Email   string `json:"email" binding:"required,email"`
	Code    string `json:"code" binding:"required"`
	Purpose string `json:"purpose"`
}

// VerifyOTPResponse reports the result; the refreshed user is included so the
// client can update its cached session (emailVerified, kycStatus, ...).
type VerifyOTPResponse struct {
	Verified bool        `json:"verified"`
	User     interface{} `json:"user,omitempty"`
}

// ForgotPasswordRequest starts the password-reset flow by mailing a code.
type ForgotPasswordRequest struct {
	Email string `json:"email" binding:"required,email"`
}

// ResetPasswordRequest completes it. The code must be the one just mailed for
// this email address.
type ResetPasswordRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Code     string `json:"code" binding:"required"`
	Password string `json:"password" binding:"required,min=6"`
}

// KYCRequest submits an 11-digit BVN for identity verification through B Moni.
// Sandbox only: never send a real BVN to this endpoint.
type KYCRequest struct {
	BVN string `json:"bvn" binding:"required"`
}

// ReferralOverview is what the referral screen renders: the caller's code, a
// ready-made link, how many people joined with it, and the bonus earned.
type ReferralOverview struct {
	Code            string `json:"code"`
	Link            string `json:"link"`
	Invited         int64  `json:"invited"`
	Verified        int64  `json:"verified"`
	EarnedKobo      int64  `json:"earnedKobo"`
	RewardEachKobo  int64  `json:"rewardEachKobo"`
	WelcomeEachKobo int64  `json:"welcomeEachKobo"`
}
