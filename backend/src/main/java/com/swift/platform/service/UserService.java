package com.swift.platform.service;

import com.swift.platform.config.AppConfig;
import com.swift.platform.dto.*;
import com.swift.platform.exception.*;
import com.swift.platform.model.User;
import com.swift.platform.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final AppConfig      appConfig;

    // ── List / search ──────────────────────────────────────────────────────
    public Page<UserDTO> getUsers(String search, String role, Boolean active,
                                  int page, int size, String sortBy, String sortDir) {
        Sort sort = sortDir.equalsIgnoreCase("asc")
                ? Sort.by(sortBy).ascending() : Sort.by(sortBy).descending();
        Pageable pageable = PageRequest.of(page, size, sort);

        Page<User> users;
        if (search != null && !search.isBlank())
            users = userRepository.searchUsers(search.trim(), pageable);
        else if (role != null && !role.isBlank() && !role.equalsIgnoreCase("ALL"))
            users = userRepository.findByRole(role.toUpperCase(), pageable);
        else if (active != null)
            users = userRepository.findByActive(active, pageable);
        else
            users = userRepository.findAll(pageable);

        return users.map(this::toDTO);
    }

    public UserDTO getUserByEmployeeId(String employeeId) {
        return toDTO(userRepository.findByEmployeeId(employeeId)
                .orElseThrow(() -> new NotFoundException("User not found: " + employeeId)));
    }

    // ── Create ─────────────────────────────────────────────────────────────
    public UserDTO createUser(UserDTO dto) {
        if (dto.getEmployeeId() == null || dto.getEmployeeId().isBlank()) throw new BadRequestException("Employee ID is required");
        if (dto.getName()       == null || dto.getName().isBlank())       throw new BadRequestException("Name is required");
        if (dto.getEmail()      == null || dto.getEmail().isBlank())      throw new BadRequestException("Email is required");
        if (dto.getPassword()   == null || dto.getPassword().isBlank())   throw new BadRequestException("Password is required");
        if (dto.getRole()       == null || dto.getRole().isBlank())       throw new BadRequestException("Role is required");

        String empId = dto.getEmployeeId().toUpperCase().trim();
        String email = dto.getEmail().toLowerCase().trim();

        if (userRepository.existsByEmployeeId(empId))  throw new ConflictException("Employee ID already exists: " + empId);
        if (userRepository.existsByEmail(email))        throw new ConflictException("Email already in use: " + email);

        User saved = userRepository.save(User.builder()
                .employeeId(empId)
                .password(dto.getPassword())
                .role(dto.getRole().toUpperCase())
                .name(dto.getName().trim())
                .email(email)
                .active(dto.isActive())
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .build());
        log.info("User created: {}", saved.getEmployeeId());
        return toDTO(saved);
    }

    // ── Update ─────────────────────────────────────────────────────────────
    public UserDTO updateUser(String employeeId, UserDTO dto) {
        User user = userRepository.findByEmployeeId(employeeId)
                .orElseThrow(() -> new NotFoundException("User not found: " + employeeId));

        String newEmail = dto.getEmail().toLowerCase().trim();
        if (!user.getEmail().equalsIgnoreCase(newEmail) &&
                userRepository.existsByEmailAndEmployeeIdNot(newEmail, employeeId))
            throw new ConflictException("Email already in use: " + newEmail);

        user.setName(dto.getName().trim());
        user.setEmail(newEmail);
        user.setRole(dto.getRole().toUpperCase());
        user.setActive(dto.isActive());
        user.setUpdatedAt(Instant.now());
        if (dto.getPassword() != null && !dto.getPassword().isBlank())
            user.setPassword(dto.getPassword());

        log.info("User updated: {}", employeeId);
        return toDTO(userRepository.save(user));
    }

    // ── Toggle status ──────────────────────────────────────────────────────
    public UserDTO toggleUserStatus(String employeeId, boolean active) {
        User user = userRepository.findByEmployeeId(employeeId)
                .orElseThrow(() -> new NotFoundException("User not found: " + employeeId));
        if (appConfig.getProtectedAdminId().equals(employeeId) && !active)
            throw new BadRequestException("Cannot disable the primary administrator account");
        user.setActive(active);
        user.setUpdatedAt(Instant.now());
        return toDTO(userRepository.save(user));
    }

    // ── Delete ─────────────────────────────────────────────────────────────
    public void deleteUser(String employeeId) {
        User user = userRepository.findByEmployeeId(employeeId)
                .orElseThrow(() -> new NotFoundException("User not found: " + employeeId));
        if (appConfig.getProtectedAdminId().equals(employeeId))
            throw new BadRequestException("Cannot delete the primary administrator account");
        userRepository.delete(user);
        log.info("User deleted: {}", employeeId);
    }

    // ── Profile ────────────────────────────────────────────────────────────
    public UserDTO getProfile(String employeeId) {
        return toDTO(userRepository.findByEmployeeId(employeeId)
                .orElseThrow(() -> new NotFoundException("Profile not found")));
    }

    public UserDTO updateProfile(String employeeId, UpdateProfileRequest req) {
        User user = userRepository.findByEmployeeId(employeeId)
                .orElseThrow(() -> new NotFoundException("User not found"));
        if (!user.getEmail().equalsIgnoreCase(req.getEmail()) &&
                userRepository.existsByEmailAndEmployeeIdNot(req.getEmail(), employeeId))
            throw new ConflictException("Email already in use: " + req.getEmail());
        user.setName(req.getName());
        user.setEmail(req.getEmail().toLowerCase());
        user.setUpdatedAt(Instant.now());
        return toDTO(userRepository.save(user));
    }

    public void changePassword(String employeeId, ChangePasswordRequest req) {
        User user = userRepository.findByEmployeeId(employeeId)
                .orElseThrow(() -> new NotFoundException("User not found"));
        if (!req.getCurrentPassword().equals(user.getPassword()))
            throw new BadRequestException("Current password is incorrect");
        if (!req.getNewPassword().equals(req.getConfirmPassword()))
            throw new BadRequestException("New passwords do not match");
        user.setPassword(req.getNewPassword());
        user.setUpdatedAt(Instant.now());
        userRepository.save(user);
    }

    // ── Stats ──────────────────────────────────────────────────────────────
    public Map<String, Long> getUserStats() {
        return Map.of(
                "total",     userRepository.count(),
                "active",    userRepository.countByActive(true),
                "inactive",  userRepository.countByActive(false),
                "admins",    userRepository.countByRole("ADMIN"),
                "employees", userRepository.countByRole("EMPLOYEE")
        );
    }

    public void updateLastLogin(String employeeId) {
        userRepository.findByEmployeeId(employeeId).ifPresent(u -> {
            u.setLastLogin(Instant.now());
            userRepository.save(u);
        });
    }

    // ── Mapper ─────────────────────────────────────────────────────────────
    public UserDTO toDTO(User u) {
        return UserDTO.builder()
                .id(u.getId()).employeeId(u.getEmployeeId()).name(u.getName())
                .email(u.getEmail()).role(u.getRole()).active(u.isActive())
                .createdAt(u.getCreatedAt()).lastLogin(u.getLastLogin()).updatedAt(u.getUpdatedAt())
                .build(); // password deliberately omitted
    }
}
