package models

import (
	"time"
)

type ApplicationUser struct {
	ID                   string     `json:"id"`
	Email                *string    `json:"email"`
	UserName             *string    `json:"userName"`
	PasswordHash         *string    `json:"-"`
	FirstName            *string    `json:"firstName"`
	LastName             *string    `json:"lastName"`
	CreatedAt            time.Time  `json:"createdAt"`
	LastLoginAt          *time.Time `json:"lastLoginAt"`
	NormalizedEmail      *string    `json:"-"`
	NormalizedUserName   *string    `json:"-"`
	EmailConfirmed       bool       `json:"emailConfirmed"`
	SecurityStamp        *string    `json:"-"`
	ConcurrencyStamp     *string    `json:"-"`
	PhoneNumberConfirmed bool       `json:"phoneNumberConfirmed"`
	TwoFactorEnabled     bool       `json:"twoFactorEnabled"`
	LockoutEnabled       bool       `json:"lockoutEnabled"`
	AccessFailedCount    int        `json:"accessFailedCount"`
	LockoutEnd           *time.Time `json:"lockoutEnd"`
}
