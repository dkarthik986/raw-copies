package com.swift.platform.dto;
import lombok.*;
import java.util.List;
@Data @AllArgsConstructor @NoArgsConstructor
public class PagedResponse<T> {
    private List<T>  content;
    private long     totalElements;
    private int      totalPages;
    private int      pageNumber;
    private int      pageSize;
    private boolean  first;
    private boolean  last;
}
