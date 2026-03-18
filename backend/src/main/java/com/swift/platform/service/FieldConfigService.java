package com.swift.platform.service;

import com.swift.platform.config.AppConfig;
import com.swift.platform.dto.FieldConfigResponse;
import lombok.RequiredArgsConstructor;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Dynamically builds the Advanced Search field config for the frontend.
 *
 * NEW SCHEMA (messages collection) — all fields are at the TOP LEVEL.
 * No more "message." prefix on DB paths.
 *
 * Field mapping (frontend param → DB field):
 *   messageType       → messageFamily
 *   messageCode       → messageTypeCode
 *   io                → direction
 *   status            → currentStatus
 *   phase             → statusPhase
 *   action            → statusAction
 *   reason            → statusReason
 *   creationDate      → dateCreated
 *   valueDate         → ampValueDate
 *   sender            → senderAddress
 *   receiver          → receiverAddress
 *   reference         → messageReference
 *   amount            → ampAmount (String, use $expr $toDouble)
 *   ccy               → ampCurrency
 *   networkProtocol   → protocol
 *   deliveryMode      → communicationType
 *   sequenceNumber    → finSequenceNumber
 *   messagePriority   → finMessagePriority
 *   mur               → mtPayload.transactionReference
 */
@Service
@RequiredArgsConstructor
public class FieldConfigService {

    private final MongoTemplate mongoTemplate;
    private final AppConfig     appConfig;

    // ── Known field metadata ───────────────────────────────────────────────
    // Format: frontendKey → [label, group, type, backendParam, showInTable]
    // backendParam = query param name sent to /api/search
    // DB field name may differ — SearchService.buildQuery handles the mapping
    private static final Map<String, Object[]> FIELD_META = new LinkedHashMap<>();

    static {
        // ── Classification ────────────────────────────────────────────────
        // DB: messageFamily / messageTypeCode / direction / currentStatus
        FIELD_META.put("messageType",          new Object[]{"Message Format",          "Classification", "select",       "messageType",               true});
        FIELD_META.put("messageCode",          new Object[]{"Message Type / Code",     "Classification", "select",       "messageCode",               true});
        FIELD_META.put("io",                   new Object[]{"Message Direction",       "Classification", "select",       "io",                        true});
        FIELD_META.put("status",               new Object[]{"Status",                  "Classification", "select",       "status",                    true});
        FIELD_META.put("messagePriority",      new Object[]{"Message Priority",        "Classification", "select",       "messagePriority",           false});
        FIELD_META.put("copyIndicator",        new Object[]{"Copy Indicator",          "Classification", "select",       "copyIndicator",             false});
        FIELD_META.put("finCopyService",       new Object[]{"FIN-COPY Service",        "Classification", "select",       "finCopyService",            true});
        FIELD_META.put("possibleDuplicate",    new Object[]{"PDE Indication",          "Classification", "boolean",      "possibleDuplicate",         true});

        // ── Date & Time ───────────────────────────────────────────────────
        // DB: dateCreated / ampValueDate / statusDate / dateReceived
        FIELD_META.put("creationDate",         new Object[]{"Creation Date Range",     "Date & Time",    "date-range",   "startDate,endDate",         true});
        FIELD_META.put("valueDate",            new Object[]{"Value Date Range",        "Date & Time",    "date-range2",  "valueDateFrom,valueDateTo", true});
        FIELD_META.put("statusDate",           new Object[]{"Status Date Range",       "Date & Time",    "date-range2",  "statusDateFrom,statusDateTo", false});
        FIELD_META.put("receivedDate",         new Object[]{"Received Date Range",     "Date & Time",    "date-range2",  "receivedDateFrom,receivedDateTo", false});

        // ── Parties ───────────────────────────────────────────────────────
        // DB: senderAddress / receiverAddress / senderName / receiverName
        FIELD_META.put("sender",               new Object[]{"Sender BIC",              "Parties",        "text",         "sender",                    true});
        FIELD_META.put("receiver",             new Object[]{"Receiver BIC",            "Parties",        "text",         "receiver",                  true});
        FIELD_META.put("senderName",           new Object[]{"Sender Institution",      "Parties",        "text",         "senderName",                false});
        FIELD_META.put("receiverName",         new Object[]{"Receiver Institution",    "Parties",        "text",         "receiverName",              false});

        // ── References ────────────────────────────────────────────────────
        // DB: messageReference / transactionReference / mtPayload.transactionReference
        FIELD_META.put("reference",            new Object[]{"Message Reference",       "References",     "text",         "reference",                 true});
        FIELD_META.put("transactionReference", new Object[]{"Transaction Reference",   "References",     "text",         "transactionReference",      false});
        FIELD_META.put("mur",                  new Object[]{"MUR (Tag 20)",            "References",     "text",         "mur",                       true});
        FIELD_META.put("sequenceNumber",       new Object[]{"Sequence No. Range",      "References",     "seq-range",    "seqFrom,seqTo",             true});

        // ── Financial ─────────────────────────────────────────────────────
        // DB: ampAmount (String) / ampCurrency / ampValueDate
        FIELD_META.put("amount",               new Object[]{"Amount Range",            "Financial",      "amount-range", "amountFrom,amountTo",       true});
        FIELD_META.put("ccy",                  new Object[]{"Currency (CCY)",          "Financial",      "select",       "ccy",                       true});

        // ── Routing ───────────────────────────────────────────────────────
        // DB: protocol / networkChannel / networkPriority / communicationType / service
        FIELD_META.put("networkProtocol",      new Object[]{"Network Protocol",        "Routing",        "select",       "networkProtocol",           true});
        FIELD_META.put("networkChannel",       new Object[]{"Network Channel",         "Routing",        "select",       "networkChannel",            true});
        FIELD_META.put("networkPriority",      new Object[]{"Network Priority",        "Routing",        "select",       "networkPriority",           false});
        FIELD_META.put("deliveryMode",         new Object[]{"Delivery Mode",           "Routing",        "select",       "deliveryMode",              true});
        FIELD_META.put("service",              new Object[]{"Service",                 "Routing",        "select",       "service",                   true});
        FIELD_META.put("backendChannelProtocol",new Object[]{"Backend Channel Protocol","Routing",       "select",       "backendChannelProtocol",    false});

        // ── Geography ─────────────────────────────────────────────────────
        FIELD_META.put("country",              new Object[]{"Country",                 "Geography",      "select",       "country",                   false});
        FIELD_META.put("originCountry",        new Object[]{"Origin Country",          "Geography",      "select",       "originCountry",             false});
        FIELD_META.put("destinationCountry",   new Object[]{"Destination Country",     "Geography",      "select",       "destinationCountry",        false});

        // ── Ownership ─────────────────────────────────────────────────────
        // DB: owner / workflow / workflowModel / originatorApplication
        FIELD_META.put("owner",                new Object[]{"Owner / Unit",            "Ownership",      "select",       "owner",                     true});
        FIELD_META.put("workflow",             new Object[]{"Workflow",                "Ownership",      "select",       "workflow",                  false});
        FIELD_META.put("workflowModel",        new Object[]{"Workflow Model",          "Ownership",      "select",       "workflowModel",             true});
        FIELD_META.put("originatorApplication",new Object[]{"Originator Application",  "Ownership",      "select",       "originatorApplication",     false});

        // ── Lifecycle ─────────────────────────────────────────────────────
        // DB: statusPhase / statusAction / statusReason
        FIELD_META.put("phase",                new Object[]{"Phase",                   "Lifecycle",      "select",       "phase",                     true});
        FIELD_META.put("action",               new Object[]{"Action",                  "Lifecycle",      "select",       "action",                    true});
        FIELD_META.put("reason",               new Object[]{"Reason",                  "Lifecycle",      "select",       "reason",                    true});

        // ── Processing ────────────────────────────────────────────────────
        // DB: processingType / processPriority / profileCode / channelProtocol
        FIELD_META.put("processingType",       new Object[]{"Processing Type",         "Processing",     "select",       "processingType",            true});
        FIELD_META.put("processPriority",      new Object[]{"Process Priority",        "Processing",     "select",       "processPriority",           false});
        FIELD_META.put("profileCode",          new Object[]{"Profile Code",            "Processing",     "select",       "profileCode",               false});

        // ── FIN Header Fields ─────────────────────────────────────────────
        // DB: finAppId / finServiceId / finLogicalTerminal / finMessagePriority
        FIELD_META.put("applicationId",        new Object[]{"Application ID",          "FIN Header",     "text",         "applicationId",             false});
        FIELD_META.put("serviceId",            new Object[]{"Service ID",              "FIN Header",     "text",         "serviceId",                 false});
        FIELD_META.put("logicalTerminalAddress",new Object[]{"Logical Terminal",       "FIN Header",     "text",         "logicalTerminalAddress",    false});

        // ── History Lines search ──────────────────────────────────────────
        // historyLines is a TOP-LEVEL array (confirmed in 100-doc dataset)
        // Entry keys: index, historyDate, phase, action, reason, entity, channel, user, comment
        FIELD_META.put("historyEntity",        new Object[]{"History Entity",          "History",        "text",         "historyEntity",             false});
        FIELD_META.put("historyDescription",   new Object[]{"History Comment",         "History",        "text",         "historyDescription",        false});
        FIELD_META.put("historyPhase",         new Object[]{"History Phase",           "History",        "select",       "historyPhase",              false});
        FIELD_META.put("historyAction",        new Object[]{"History Action",          "History",        "select",       "historyAction",             false});
        FIELD_META.put("historyUser",          new Object[]{"History User",            "History",        "text",         "historyUser",               false});
        FIELD_META.put("historyChannel",       new Object[]{"History Channel",         "History",        "text",         "historyChannel",            false});

        // ── Payload Search ────────────────────────────────────────────────
        // Search within mtPayload.block4Fields array
        FIELD_META.put("block4Value",          new Object[]{"Payload Field Value",     "Payload",        "text-wide",    "block4Value",               false});

        // ── Other ─────────────────────────────────────────────────────────
        FIELD_META.put("freeSearch",           new Object[]{"Free Search Text",        "Other",          "text-wide",    "freeSearchText",            false});
    }

    // Fields to skip during auto-discovery
    private static final Set<String> SKIP_FIELDS = Set.of(
            "_id", "_class", "version", "firstSeenAt", "lastUpdatedAt",
            "mtPayload", "digest", "digestAlgorithm",
            "digestMCheckResult", "digest2CheckResult",
            "bulkTotalFileSize", "bulkedFileSize", "bulkTotalMessages", "bulkSequenceNumber",
            "ampRemittanceInformation", "ampDetailsOfCharges",
            "finReceiversAddress", "finDirectionId", "finMessageType",
            "backendChannelCode", "backendChannelDescription",
            "messageTypeDescription",
            "historyLines"
    );

    private static final Set<String> DATE_FIELDS = Set.of(
            "dateCreated", "dateReceived", "statusDate", "ampValueDate"
    );

    // Frontend key → DB field for select options lookup
    private static final Map<String, String> PARAM_TO_DB = Map.ofEntries(
            Map.entry("messageType",           "messageFamily"),
            Map.entry("messageCode",           "messageTypeCode"),
            Map.entry("io",                    "direction"),
            Map.entry("status",                "currentStatus"),
            Map.entry("phase",                 "statusPhase"),
            Map.entry("action",                "statusAction"),
            Map.entry("reason",                "statusReason"),
            Map.entry("networkProtocol",       "protocol"),
            Map.entry("deliveryMode",          "communicationType"),
            Map.entry("ccy",                   "ampCurrency"),
            Map.entry("messagePriority",       "finMessagePriority"),
            Map.entry("sender",                "senderAddress"),
            Map.entry("receiver",              "receiverAddress"),
            Map.entry("senderName",            "senderName"),
            Map.entry("receiverName",          "receiverName"),
            Map.entry("backendChannelProtocol","channelProtocol")
    );

    public List<FieldConfigResponse> getFieldConfig() {
        String col = appConfig.getSwiftCollection();
        Set<String> discoveredKeys = discoverTopLevelKeys(col);

        List<FieldConfigResponse> result   = new ArrayList<>();
        Set<String>               handled  = new LinkedHashSet<>();

        for (Map.Entry<String, Object[]> entry : FIELD_META.entrySet()) {
            String   key          = entry.getKey();
            Object[] meta         = entry.getValue();
            String   label        = (String)  meta[0];
            String   group        = (String)  meta[1];
            String   type         = (String)  meta[2];
            String   backendParam = (String)  meta[3];
            boolean  showInTable  = (Boolean) meta[4];

            List<String> options = Collections.emptyList();
            if ("select".equals(type)) {
                // Resolve the actual DB field name for distinct query
                String dbField = PARAM_TO_DB.getOrDefault(key, key);
                options = distinctValues(dbField, col);
            }

            result.add(new FieldConfigResponse(
                    key, label, group, type, options, backendParam,
                    showInTable ? label : null, showInTable
            ));
            handled.add(key);
        }

        // Manually add fixed extra fields
        result.add(new FieldConfigResponse(
                "freeSearch", "Free Search Text", "Other", "text-wide",
                Collections.emptyList(), "freeSearchText", null, false));
        handled.add("freeSearch");

        // Auto-discover additional top-level fields not in FIELD_META
        for (String key : discoveredKeys) {
            if (handled.contains(key) || SKIP_FIELDS.contains(key)) continue;

            String type;
            List<String> options = Collections.emptyList();

            if (DATE_FIELDS.contains(key)) {
                type = "date-range2";
            } else {
                List<String> vals = distinctValues(key, col);
                if (!vals.isEmpty() && vals.size() <= 50) {
                    type    = "select";
                    options = vals;
                } else {
                    type = "text";
                }
            }

            result.add(new FieldConfigResponse(
                    key, camelToLabel(key), "Discovered", type, options,
                    key, null, false
            ));
        }

        return result;
    }

    /** Scan up to 200 documents to find all TOP-LEVEL keys (not message.* nested) */
    private Set<String> discoverTopLevelKeys(String col) {
        Set<String> keys = new LinkedHashSet<>();
        try {
            Query q = new Query().limit(200);
            List<Document> docs = mongoTemplate.find(q, Document.class, col);
            for (Document doc : docs) {
                keys.addAll(doc.keySet());
            }
        } catch (Exception e) {
            System.err.println("[FieldConfigService] discoverTopLevelKeys failed: " + e.getMessage());
        }
        return keys;
    }

    private List<String> distinctValues(String fieldPath, String col) {
        try {
            return mongoTemplate.findDistinct(new Query(), fieldPath, col, String.class)
                    .stream().filter(v -> v != null && !v.isBlank()).sorted().collect(Collectors.toList());
        } catch (Exception e) { return Collections.emptyList(); }
    }

    private String camelToLabel(String s) {
        if (s == null || s.isEmpty()) return s;
        StringBuilder sb = new StringBuilder();
        sb.append(Character.toUpperCase(s.charAt(0)));
        for (int i = 1; i < s.length(); i++) {
            char c = s.charAt(i);
            if (Character.isUpperCase(c)) { sb.append(' '); sb.append(c); }
            else sb.append(c);
        }
        return sb.toString();
    }
}