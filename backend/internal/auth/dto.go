package auth

// RegisterRequest is the JSON body for POST /api/v1/auth/register.
type RegisterRequest struct {
	Name     string `json:"name" binding:"required,min=2"`
	Email    string `json:"email" binding:"required,email"`
	Phone    string `json:"phone"`
	Password string `json:"password" binding:"required,min=6"`
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
