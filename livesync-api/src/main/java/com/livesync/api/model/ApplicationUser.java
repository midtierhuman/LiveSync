package com.livesync.api.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "AspNetUsers")
public class ApplicationUser {
    @Id
    @Column(name = "Id")
    private String id;
    @Column(name = "Email")
    private String email;
    @Column(name = "UserName")
    private String userName;
    @Column(name = "PasswordHash")
    private String passwordHash;
    @Column(name = "FirstName")
    private String firstName;
    @Column(name = "LastName")
    private String lastName;
    @Column(name = "CreatedAt", nullable = false)
    private Instant createdAt;
    @Column(name = "LastLoginAt")
    private Instant lastLoginAt;
    @Column(name = "NormalizedEmail")
    private String normalizedEmail;
    @Column(name = "NormalizedUserName")
    private String normalizedUserName;
    @Column(name = "EmailConfirmed", nullable = false)
    private boolean emailConfirmed;
    @Column(name = "SecurityStamp")
    private String securityStamp;
    @Column(name = "ConcurrencyStamp")
    private String concurrencyStamp;
    @Column(name = "PhoneNumberConfirmed", nullable = false)
    private boolean phoneNumberConfirmed;
    @Column(name = "TwoFactorEnabled", nullable = false)
    private boolean twoFactorEnabled;
    @Column(name = "LockoutEnabled", nullable = false)
    private boolean lockoutEnabled;
    @Column(name = "AccessFailedCount", nullable = false)
    private int accessFailedCount;
    @Column(name = "LockoutEnd")
    private Instant lockoutEnd;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getUserName() {
        return userName;
    }

    public void setUserName(String userName) {
        this.userName = userName;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public String getFirstName() {
        return firstName;
    }

    public void setFirstName(String firstName) {
        this.firstName = firstName;
    }

    public String getLastName() {
        return lastName;
    }

    public void setLastName(String lastName) {
        this.lastName = lastName;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getLastLoginAt() {
        return lastLoginAt;
    }

    public void setLastLoginAt(Instant lastLoginAt) {
        this.lastLoginAt = lastLoginAt;
    }

    public String getNormalizedEmail() {
        return normalizedEmail;
    }

    public void setNormalizedEmail(String value) {
        normalizedEmail = value;
    }

    public String getNormalizedUserName() {
        return normalizedUserName;
    }

    public void setNormalizedUserName(String value) {
        normalizedUserName = value;
    }

    public boolean isEmailConfirmed() {
        return emailConfirmed;
    }

    public void setEmailConfirmed(boolean value) {
        emailConfirmed = value;
    }

    public String getSecurityStamp() {
        return securityStamp;
    }

    public void setSecurityStamp(String value) {
        securityStamp = value;
    }

    public String getConcurrencyStamp() {
        return concurrencyStamp;
    }

    public void setConcurrencyStamp(String value) {
        concurrencyStamp = value;
    }

    public boolean isPhoneNumberConfirmed() {
        return phoneNumberConfirmed;
    }

    public void setPhoneNumberConfirmed(boolean value) {
        phoneNumberConfirmed = value;
    }

    public boolean isTwoFactorEnabled() {
        return twoFactorEnabled;
    }

    public void setTwoFactorEnabled(boolean value) {
        twoFactorEnabled = value;
    }

    public boolean isLockoutEnabled() {
        return lockoutEnabled;
    }

    public void setLockoutEnabled(boolean value) {
        lockoutEnabled = value;
    }

    public int getAccessFailedCount() {
        return accessFailedCount;
    }

    public void setAccessFailedCount(int value) {
        accessFailedCount = value;
    }

    public Instant getLockoutEnd() {
        return lockoutEnd;
    }

    public void setLockoutEnd(Instant value) {
        lockoutEnd = value;
    }
}

