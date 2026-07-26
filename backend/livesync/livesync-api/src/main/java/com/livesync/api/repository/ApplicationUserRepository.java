package com.livesync.api.repository;

import com.livesync.api.model.ApplicationUser;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ApplicationUserRepository extends JpaRepository<ApplicationUser, String> {
    Optional<ApplicationUser> findByNormalizedEmail(String normalizedEmail);
    Optional<ApplicationUser> findByNormalizedUserName(String normalizedUserName);
}
