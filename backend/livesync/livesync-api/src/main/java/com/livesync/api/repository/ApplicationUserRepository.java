package com.livesync.api.repository;

import com.livesync.api.model.ApplicationUser;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ApplicationUserRepository extends JpaRepository<ApplicationUser, String> {
    Optional<ApplicationUser> findByNormalizedEmail(String normalizedEmail);

    Optional<ApplicationUser> findByNormalizedUserName(String normalizedUserName);
}

