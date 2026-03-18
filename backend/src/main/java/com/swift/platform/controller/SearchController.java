package com.swift.platform.controller;

import com.swift.platform.config.AppConfig;
import com.swift.platform.dto.DropdownOptionsResponse;
import com.swift.platform.dto.FieldConfigResponse;
import com.swift.platform.dto.PagedResponse;
import com.swift.platform.dto.SearchResponse;
import com.swift.platform.service.AuditService;
import com.swift.platform.service.FieldConfigService;
import com.swift.platform.service.SearchService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequiredArgsConstructor
public class SearchController {

    private final SearchService     searchService;
    private final AuditService      auditService;
    private final AppConfig         appConfig;
    private final FieldConfigService fieldConfigService;

    @GetMapping("/api/search")
    public PagedResponse<SearchResponse> search(@RequestParam Map<String, String> allParams,
                                                HttpServletRequest httpReq) {
        int page = parseIntOr(allParams.remove("page"), 0);
        int size = parseIntOr(allParams.remove("size"), appConfig.getDefaultPageSize());

        Map<String, String> filters = new HashMap<>();
        allParams.forEach((k, v) -> { if (v != null && !v.isBlank()) filters.put(k, v); });

        String employeeId = (String) httpReq.getAttribute("employeeId");
        auditService.log(employeeId, "SEARCH", "Filters: " + filters, httpReq.getRemoteAddr());

        return searchService.search(filters, page, size);
    }

    @GetMapping("/api/dropdown-options")
    public DropdownOptionsResponse dropdownOptions() {
        return searchService.getDropdownOptions();
    }

    /** Legacy alias kept for backwards compatibility */
    @GetMapping("/api/search/options")
    public DropdownOptionsResponse dropdownOptionsLegacy() {
        return searchService.getDropdownOptions();
    }

    /**
     * Dynamic field config — scans the DB and returns all searchable fields.
     * Frontend uses this to build the Advanced Search panel dynamically.
     * New fields in MongoDB auto-appear here with no code changes.
     */
    @GetMapping("/api/search/field-config")
    public List<FieldConfigResponse> fieldConfig() {
        return fieldConfigService.getFieldConfig();
    }

    private int parseIntOr(String val, int def) {
        try { return Integer.parseInt(val); } catch (Exception e) { return def; }
    }
}
