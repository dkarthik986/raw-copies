package com.swift.platform.service;

import com.swift.platform.config.AppConfig;
import com.swift.platform.dto.DropdownOptionsResponse;
import com.swift.platform.dto.PagedResponse;
import com.swift.platform.dto.SearchResponse;
import lombok.RequiredArgsConstructor;
import org.bson.Document;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * SearchService — fully mapped for the flat "messages" collection (ampdb.messages).
 *
 * Schema verified against 100-document dataset. All top-level + mtPayload fields covered.
 *
 * TOP-LEVEL fields (direct document root):
 *   ampAmount, ampCurrency, ampDetailsOfCharges, ampRemittanceInformation, ampValueDate,
 *   backendChannel, backendChannelCode, backendChannelDescription,
 *   bulkSequenceNumber, bulkTotalMessages, bulkType,
 *   channelCode, channelProtocol, communicationType,
 *   currentStatus, dateCreated, dateReceived,
 *   digest2CheckResult, digestMCheckResult, direction,
 *   finAppId, finDirectionId, finLogicalTerminal, finMessagePriority, finMessageType,
 *   finReceiversAddress, finSequenceNumber, finServiceId, finSessionNumber,
 *   historyLines[], messageFamily, messageFormat, messageReference,
 *   messageTypeCode, messageTypeDescription, mtPayload{},
 *   networkChannel, networkPriority, originatorApplication, owner,
 *   pdeIndication, processPriority, processingType, profileCode, protocol,
 *   receiverAddress, receiverName, senderAddress, senderName, service,
 *   statusAction, statusChangeSource, statusDate, statusDecision,
 *   statusMessage, statusPhase, statusReason, transactionReference,
 *   workflow, workflowModel
 *
 * mtPayload nested fields:
 *   block1: applicationId, serviceId, logicalTerminalAddress, sessionNumber, sequenceNumber
 *   block2: directionId, messageType, messagePriority, receiverAddress
 *   block4Fields[]: tag, label, rawValue, components{}
 *   Flat extracted: transactionReference, bankOperationCode, currency, valueDate,
 *     interbankSettledAmount, instructedCurrency, instructedAmount,
 *     orderingCustomer, orderingInstitution, senderCorrespondent,
 *     accountWithInstitution, beneficiaryCustomer, remittanceInfo, detailsOfCharges,
 *     rawFin, fieldCount, payloadSize, payloadEncoding, digest, digestAlgorithm
 *
 * historyLines[]: index, historyDate, phase, action, reason, entity, channel, user, comment
 */
@Service
@RequiredArgsConstructor
public class SearchService {

    private final MongoTemplate mongoTemplate;
    private final AppConfig     appConfig;

    // ── Dropdown options ───────────────────────────────────────────────────
    public DropdownOptionsResponse getDropdownOptions() {
        String col = appConfig.getSwiftCollection();
        DropdownOptionsResponse res = new DropdownOptionsResponse();

        // Classification
        res.setFormats(Arrays.asList("MT", "MX"));
        List<String> codes   = distinct("messageTypeCode", col);
        List<String> mtCodes = codes.stream().filter(c -> c.toUpperCase().startsWith("MT")).sorted().collect(Collectors.toList());
        List<String> mxCodes = codes.stream().filter(c -> !c.toUpperCase().startsWith("MT")).sorted().collect(Collectors.toList());
        res.setMessageCodes(codes);
        res.setTypes(codes);
        res.setMtTypes(mtCodes);
        res.setMxTypes(mxCodes);
        res.setAllMtMxTypes(Collections.emptyList());
        res.setStatuses(distinct("currentStatus", col));
        res.setPhases(distinct("statusPhase", col));
        res.setActions(distinct("statusAction", col));
        res.setIoDirections(distinct("direction", col));
        res.setDirections(distinct("direction", col));
        res.setReasons(distinct("statusReason", col));

        // Network & routing
        res.setNetworkProtocols(distinct("protocol", col));
        res.setNetworks(distinct("protocol", col));
        res.setNetworkChannels(distinct("networkChannel", col));
        res.setBackendChannels(distinct("backendChannel", col));
        res.setNetworkPriorities(distinct("networkPriority", col));
        res.setNetworkStatuses(Collections.emptyList());
        res.setDeliveryModes(distinct("communicationType", col));
        res.setServices(distinct("service", col));

        // Parties
        res.setSenders(distinct("senderAddress", col));
        res.setReceivers(distinct("receiverAddress", col));
        res.setCountries(Collections.emptyList());
        res.setOriginCountries(Collections.emptyList());
        res.setDestinationCountries(Collections.emptyList());

        // Ownership & workflow
        res.setOwners(distinct("owner", col));
        res.setOwnerUnits(distinct("owner", col));
        res.setWorkflows(distinct("workflow", col));
        res.setWorkflowModels(distinct("workflowModel", col));
        res.setSourceSystems(Collections.emptyList());
        res.setOriginatorApplications(distinct("originatorApplication", col));

        // Financial
        res.setCurrencies(distinct("ampCurrency", col));

        // Processing
        res.setProcessingTypes(distinct("processingType", col));
        res.setProcessPriorities(distinct("processPriority", col));
        res.setProfileCodes(distinct("profileCode", col));
        res.setEnvironments(Collections.emptyList());

        // AML / Compliance — not in this schema
        res.setAmlStatuses(Collections.emptyList());
        res.setFinCopies(Collections.emptyList());
        res.setFinCopyServices(Collections.emptyList());
        res.setMessagePriorities(distinct("finMessagePriority", col));
        res.setNackCodes(Collections.emptyList());
        res.setCopyIndicators(Collections.emptyList());

        return res;
    }

    private List<String> distinct(String fieldPath, String col) {
        try {
            return mongoTemplate.findDistinct(new Query(), fieldPath, col, String.class)
                    .stream().filter(v -> v != null && !v.isBlank()).sorted().collect(Collectors.toList());
        } catch (Exception e) { return Collections.emptyList(); }
    }

    // ── Search ─────────────────────────────────────────────────────────────
    public PagedResponse<SearchResponse> search(Map<String, String> filters, int page, int size) {
        String col = appConfig.getSwiftCollection();
        size = Math.min(size, appConfig.getMaxPageSize());
        Query query = buildQuery(filters);
        long total  = mongoTemplate.count(query, Document.class, col);

        query.skip((long) page * size)
                .limit(size)
                .with(Sort.by(Sort.Direction.DESC, "dateCreated"));

        List<Document> docs = mongoTemplate.find(query, Document.class, col);
        List<SearchResponse> rows = docs.stream().map(this::toResponse).collect(Collectors.toList());

        int totalPages = size > 0 ? (int) Math.ceil((double) total / size) : 0;
        return new PagedResponse<>(rows, total, totalPages, page, size, page == 0, page >= totalPages - 1);
    }

    // ── Query builder ──────────────────────────────────────────────────────
    private Query buildQuery(Map<String, String> f) {
        List<Criteria> criteria = new ArrayList<>();

        // ── Classification ─────────────────────────────────────────────────
        exactIf(criteria, f, "messageType",     "messageFamily");
        exactIf(criteria, f, "messageCode",     "messageTypeCode");
        exactIf(criteria, f, "io",              "direction");
        exactIf(criteria, f, "status",          "currentStatus");
        exactIf(criteria, f, "phase",           "statusPhase");
        exactIf(criteria, f, "action",          "statusAction");
        exactIf(criteria, f, "reason",          "statusReason");
        exactIf(criteria, f, "messagePriority", "finMessagePriority");

        // ── Network / routing ───────────────────────────────────────────────
        exactIf(criteria, f, "networkProtocol", "protocol");
        exactIf(criteria, f, "networkChannel",  "networkChannel");
        exactIf(criteria, f, "networkPriority", "networkPriority");
        exactIf(criteria, f, "deliveryMode",    "communicationType");
        exactIf(criteria, f, "service",         "service");
        exactIf(criteria, f, "backendChannelProtocol", "channelProtocol");
        exactIf(criteria, f, "backendChannelCode",     "backendChannelCode");

        // ── Ownership / processing ──────────────────────────────────────────
        exactIf(criteria, f, "owner",                 "owner");
        exactIf(criteria, f, "workflow",               "workflow");
        exactIf(criteria, f, "workflowModel",          "workflowModel");
        exactIf(criteria, f, "originatorApplication",  "originatorApplication");
        exactIf(criteria, f, "processingType",         "processingType");
        exactIf(criteria, f, "processPriority",        "processPriority");
        exactIf(criteria, f, "profileCode",            "profileCode");

        // ── Financial ───────────────────────────────────────────────────────
        exactIf(criteria, f, "ccy", "ampCurrency");

        // ── Parties (exact BIC match) ───────────────────────────────────────
        exactIf(criteria, f, "sender",   "senderAddress");
        exactIf(criteria, f, "receiver", "receiverAddress");

        // ── PDE / duplicate flag (stored as "true"/"false" string) ──────────
        String pde = f.get("possibleDuplicate");
        if (notBlank(pde)) criteria.add(Criteria.where("pdeIndication").is(pde.toLowerCase()));

        // ── Digest check results ────────────────────────────────────────────
        exactIf(criteria, f, "digestMCheckResult", "digestMCheckResult");
        exactIf(criteria, f, "digest2CheckResult", "digest2CheckResult");

        // ── Regex (partial match) ───────────────────────────────────────────
        regexIf(criteria, f, "reference",            "messageReference");
        regexIf(criteria, f, "transactionReference", "transactionReference");
        regexIf(criteria, f, "mur",                  "mtPayload.transactionReference");
        regexIf(criteria, f, "networkReference",     "networkReference");
        regexIf(criteria, f, "e2eMessageId",         "e2eMessageId");
        regexIf(criteria, f, "amlDetails",           "amlDetails");
        // FIN header text search
        regexIf(criteria, f, "logicalTerminalAddress", "finLogicalTerminal");
        regexIf(criteria, f, "applicationId",          "finAppId");
        regexIf(criteria, f, "serviceId",              "finServiceId");
        regexIf(criteria, f, "finReceiversAddress",    "finReceiversAddress");

        // ── Date ranges ─────────────────────────────────────────────────────
        // Creation date  → dateCreated
        dateRangeIf(criteria, f, "startDate",        "endDate",        "dateCreated");
        // Value date     → ampValueDate
        dateRangeIf(criteria, f, "valueDateFrom",    "valueDateTo",    "ampValueDate");
        // Status date    → statusDate
        dateRangeIf(criteria, f, "statusDateFrom",   "statusDateTo",   "statusDate");
        // Received date  → dateReceived
        dateRangeIf(criteria, f, "receivedDateFrom", "receivedDateTo", "dateReceived");

        // ── Amount range — ampAmount stored as String, use $expr $toDouble ───
        String amtFrom = f.get("amountFrom"), amtTo = f.get("amountTo");
        if (notBlank(amtFrom) || notBlank(amtTo)) {
            try {
                List<Document> andConds = new ArrayList<>();
                if (notBlank(amtFrom)) andConds.add(new Document("$gte",
                        Arrays.asList(new Document("$toDouble", "$ampAmount"), Double.parseDouble(amtFrom))));
                if (notBlank(amtTo))   andConds.add(new Document("$lte",
                        Arrays.asList(new Document("$toDouble", "$ampAmount"), Double.parseDouble(amtTo))));
                Object exprVal = andConds.size() == 1 ? andConds.get(0) : new Document("$and", andConds);
                criteria.add(new Criteria() {
                    @Override public Document getCriteriaObject() { return new Document("$expr", exprVal); }
                });
            } catch (NumberFormatException ignored) {}
        }

        // ── Sequence number range — finSequenceNumber stored as String ────────
        String seqFrom = f.get("seqFrom"), seqTo = f.get("seqTo");
        if (notBlank(seqFrom) || notBlank(seqTo)) {
            try {
                List<Document> andConds = new ArrayList<>();
                if (notBlank(seqFrom)) andConds.add(new Document("$gte",
                        Arrays.asList(new Document("$toInt", "$finSequenceNumber"), Integer.parseInt(seqFrom.trim()))));
                if (notBlank(seqTo))   andConds.add(new Document("$lte",
                        Arrays.asList(new Document("$toInt", "$finSequenceNumber"), Integer.parseInt(seqTo.trim()))));
                Object exprVal = andConds.size() == 1 ? andConds.get(0) : new Document("$and", andConds);
                criteria.add(new Criteria() {
                    @Override public Document getCriteriaObject() { return new Document("$expr", exprVal); }
                });
            } catch (NumberFormatException ignored) {}
        }

        // ── historyLines search (top-level array, confirmed in 100-doc dataset)
        // Each entry: { index, historyDate, phase, action, reason, entity, channel, user, comment }
        String he = f.get("historyEntity");
        if (notBlank(he)) criteria.add(
                Criteria.where("historyLines").elemMatch(Criteria.where("entity").regex(escapeRegex(he), "i")));
        String hd = f.get("historyDescription");
        if (notBlank(hd)) criteria.add(
                Criteria.where("historyLines").elemMatch(Criteria.where("comment").regex(escapeRegex(hd), "i")));
        String hphase = f.get("historyPhase");
        if (notBlank(hphase)) criteria.add(
                Criteria.where("historyLines").elemMatch(Criteria.where("phase").is(hphase)));
        String haction = f.get("historyAction");
        if (notBlank(haction)) criteria.add(
                Criteria.where("historyLines").elemMatch(Criteria.where("action").is(haction)));
        String huser = f.get("historyUser");
        if (notBlank(huser)) criteria.add(
                Criteria.where("historyLines").elemMatch(Criteria.where("user").regex(escapeRegex(huser), "i")));
        String hchannel = f.get("historyChannel");
        if (notBlank(hchannel)) criteria.add(
                Criteria.where("historyLines").elemMatch(Criteria.where("channel").regex(escapeRegex(hchannel), "i")));

        // ── block4Fields tag search (mtPayload.block4Fields[]) ─────────────────
        String tag = f.get("block4Tag"), tagVal = f.get("block4Value");
        if (notBlank(tag) && notBlank(tagVal)) {
            criteria.add(Criteria.where("mtPayload.block4Fields").elemMatch(
                    Criteria.where("tag").is(tag).and("rawValue").regex(escapeRegex(tagVal), "i")));
        } else if (notBlank(tagVal)) {
            criteria.add(Criteria.where("mtPayload.block4Fields").elemMatch(
                    Criteria.where("rawValue").regex(escapeRegex(tagVal), "i")));
        }

        // ── Free text search ────────────────────────────────────────────────
        String ft = f.get("freeSearchText");
        if (notBlank(ft)) {
            String rx = escapeRegex(ft);
            criteria.add(new Criteria().orOperator(
                    Criteria.where("messageReference").regex(rx, "i"),
                    Criteria.where("transactionReference").regex(rx, "i"),
                    Criteria.where("senderAddress").regex(rx, "i"),
                    Criteria.where("receiverAddress").regex(rx, "i"),
                    Criteria.where("senderName").regex(rx, "i"),
                    Criteria.where("receiverName").regex(rx, "i"),
                    Criteria.where("owner").regex(rx, "i"),
                    Criteria.where("workflow").regex(rx, "i"),
                    Criteria.where("currentStatus").regex(rx, "i"),
                    Criteria.where("statusMessage").regex(rx, "i"),
                    Criteria.where("historyLines.comment").regex(rx, "i"),
                    Criteria.where("historyLines.entity").regex(rx, "i"),
                    Criteria.where("mtPayload.transactionReference").regex(rx, "i"),
                    Criteria.where("mtPayload.block4Fields.rawValue").regex(rx, "i"),
                    Criteria.where("mtPayload.orderingCustomer").regex(rx, "i"),
                    Criteria.where("mtPayload.beneficiaryCustomer").regex(rx, "i")
            ));
        }

        // ── Dynamic catch-all ───────────────────────────────────────────────
        // Any unrecognised param → exact match on the top-level field directly
        Set<String> handledParams = Set.of(
                "messageType","messageCode","io","status","phase","action","reason","messagePriority",
                "networkProtocol","networkChannel","networkPriority","deliveryMode","service",
                "backendChannelProtocol","backendChannelCode",
                "owner","workflow","workflowModel","originatorApplication",
                "processingType","processPriority","profileCode","ccy",
                "sender","receiver","possibleDuplicate","digestMCheckResult","digest2CheckResult",
                "reference","transactionReference","mur","networkReference","e2eMessageId","amlDetails",
                "logicalTerminalAddress","applicationId","serviceId","finReceiversAddress",
                "startDate","endDate","valueDateFrom","valueDateTo",
                "statusDateFrom","statusDateTo","receivedDateFrom","receivedDateTo",
                "amountFrom","amountTo","seqFrom","seqTo",
                "historyEntity","historyDescription","historyPhase","historyAction","historyUser","historyChannel",
                "block4Tag","block4Value","freeSearchText","page","size"
        );
        f.forEach((param, value) -> {
            if (!handledParams.contains(param) && notBlank(value)) {
                criteria.add(Criteria.where(param).is(value));
            }
        });

        if (criteria.isEmpty()) return new Query();
        return new Query(new Criteria().andOperator(criteria.toArray(new Criteria[0])));
    }

    private void exactIf(List<Criteria> l, Map<String,String> f, String paramKey, String dbField) {
        String v = f.get(paramKey);
        if (notBlank(v)) l.add(Criteria.where(dbField).is(v));
    }
    private void regexIf(List<Criteria> l, Map<String,String> f, String paramKey, String dbField) {
        String v = f.get(paramKey);
        if (notBlank(v)) l.add(Criteria.where(dbField).regex(escapeRegex(v), "i"));
    }
    private void dateRangeIf(List<Criteria> l, Map<String,String> f, String fromKey, String toKey, String field) {
        String sd = f.get(fromKey), ed = f.get(toKey);
        if (notBlank(sd) && notBlank(ed))   l.add(Criteria.where(field).gte(sd).lte(ed + "T23:59:59Z"));
        else if (notBlank(sd))              l.add(Criteria.where(field).gte(sd));
        else if (notBlank(ed))              l.add(Criteria.where(field).lte(ed + "T23:59:59Z"));
    }
    private boolean notBlank(String v)    { return v != null && !v.isBlank(); }
    private String  escapeRegex(String s) { return s.replaceAll("[\\\\^$.|?*+()\\[\\]{}]", "\\\\$0"); }

    // ── Document → SearchResponse ──────────────────────────────────────────
    @SuppressWarnings("unchecked")
    private SearchResponse toResponse(Document doc) {
        SearchResponse r = new SearchResponse();

        // ID
        Object oid = doc.get("_id");
        r.setId(oid != null ? oid.toString() : null);

        // ── Sequence / session ─────────────────────────────────────────────
        parseIntStr(doc.getString("finSequenceNumber"), r::setSequenceNumber);
        r.setSessionNumber(doc.getString("finSessionNumber"));

        // ── Classification ─────────────────────────────────────────────────
        r.setMessageType(doc.getString("messageFamily"));
        r.setMessageCode(doc.getString("messageTypeCode"));
        r.setMessageFormat(doc.getString("messageFormat"));
        r.setMessageTypeDescription(doc.getString("messageTypeDescription"));

        // ── Status / lifecycle ─────────────────────────────────────────────
        r.setStatus(doc.getString("currentStatus"));
        r.setPhase(doc.getString("statusPhase"));
        r.setAction(doc.getString("statusAction"));
        r.setReason(doc.getString("statusReason"));
        r.setStatusMessage(doc.getString("statusMessage"));
        r.setStatusChangeSource(doc.getString("statusChangeSource"));
        r.setStatusDecision(doc.getString("statusDecision"));
        r.setIo(doc.getString("direction"));

        // ── Dates ──────────────────────────────────────────────────────────
        r.setCreationDate(doc.getString("dateCreated"));
        r.setReceivedDT(doc.getString("dateReceived"));
        r.setStatusDate(doc.getString("statusDate"));
        r.setValueDate(doc.getString("ampValueDate"));

        // ── Parties ────────────────────────────────────────────────────────
        r.setSender(doc.getString("senderAddress"));
        r.setReceiver(doc.getString("receiverAddress"));
        r.setSenderInstitutionName(doc.getString("senderName"));
        r.setReceiverInstitutionName(doc.getString("receiverName"));

        // ── References ────────────────────────────────────────────────────
        r.setReference(doc.getString("messageReference"));
        r.setTransactionReference(doc.getString("transactionReference"));

        // ── Financial ─────────────────────────────────────────────────────
        // ampAmount stored as String e.g. "2448994.05"
        String amtStr = doc.getString("ampAmount");
        if (amtStr != null) {
            try { r.setAmount(Double.parseDouble(amtStr.replace(",", "."))); }
            catch (NumberFormatException ignored) {}
        }
        r.setCcy(doc.getString("ampCurrency"));
        r.setDetailsOfCharges(doc.getString("ampDetailsOfCharges"));
        r.setRemittanceInfo(doc.getString("ampRemittanceInformation"));

        // ── Network / routing ──────────────────────────────────────────────
        r.setNetworkProtocol(doc.getString("protocol"));
        r.setNetworkChannel(doc.getString("networkChannel"));
        r.setNetworkPriority(doc.getString("networkPriority"));
        r.setDeliveryMode(doc.getString("communicationType"));
        r.setCommunicationType(doc.getString("communicationType"));
        r.setService(doc.getString("service"));
        r.setBackendChannel(doc.getString("backendChannel"));
        r.setBackendChannelCode(doc.getString("backendChannelCode"));
        r.setBackendChannelDescription(doc.getString("backendChannelDescription"));
        r.setChannelCode(doc.getString("channelCode"));
        r.setBackendChannelProtocol(doc.getString("channelProtocol"));

        // ── Processing / ownership ─────────────────────────────────────────
        r.setOwner(doc.getString("owner"));
        r.setWorkflow(doc.getString("workflow"));
        r.setWorkflowModel(doc.getString("workflowModel"));
        r.setProcessingType(doc.getString("processingType"));
        r.setProcessPriority(doc.getString("processPriority"));
        r.setProfileCode(doc.getString("profileCode"));
        r.setOriginatorApplication(doc.getString("originatorApplication"));

        // ── FIN header — top-level flat fields ─────────────────────────────
        r.setApplicationId(doc.getString("finAppId"));
        r.setServiceId(doc.getString("finServiceId"));
        r.setLogicalTerminalAddress(doc.getString("finLogicalTerminal"));
        r.setMessagePriority(doc.getString("finMessagePriority"));
        r.setFinDirectionId(doc.getString("finDirectionId"));
        r.setFinMessageType(doc.getString("finMessageType"));
        r.setFinReceiversAddress(doc.getString("finReceiversAddress"));

        // ── Digest / integrity ─────────────────────────────────────────────
        r.setDigestMCheckResult(doc.getString("digestMCheckResult"));
        r.setDigest2CheckResult(doc.getString("digest2CheckResult"));

        // ── Bulk info ──────────────────────────────────────────────────────
        r.setBulkType(doc.getString("bulkType"));
        Object bsn = doc.get("bulkSequenceNumber");
        if (bsn instanceof Number n) r.setBulkSequenceNumber(n.intValue());
        Object btm = doc.get("bulkTotalMessages");
        if (btm instanceof Number n) r.setBulkTotalMessages(n.intValue());

        // ── PDE / duplicate flag ───────────────────────────────────────────
        String pde = doc.getString("pdeIndication");
        r.setPdeIndication(pde);
        r.setPossibleDuplicate("true".equalsIgnoreCase(pde));

        // ── historyLines (top-level array) ─────────────────────────────────
        Object hlRaw = doc.get("historyLines");
        if (hlRaw instanceof List<?> hlList) {
            r.setHistoryLines(hlList.stream()
                    .filter(e -> e instanceof Document)
                    .map(e -> new LinkedHashMap<String, Object>((Document) e))
                    .collect(Collectors.toList()));
        }

        // ── mtPayload nested document ──────────────────────────────────────
        Document mtPayload = doc.get("mtPayload") instanceof Document mp ? mp : new Document();
        Document block1    = mtPayload.get("block1") instanceof Document b1 ? b1 : new Document();
        Document block2    = mtPayload.get("block2") instanceof Document b2 ? b2 : new Document();

        // MUR = tag-20 value (Transaction Reference from block4)
        r.setMur(mtPayload.getString("transactionReference"));

        // Financial extracted fields from mtPayload
        r.setBankOperationCode(mtPayload.getString("bankOperationCode"));
        r.setPayloadCurrency(mtPayload.getString("currency"));
        r.setPayloadValueDate(mtPayload.getString("valueDate"));
        r.setInterbankSettledAmount(mtPayload.getString("interbankSettledAmount"));
        r.setInstructedCurrency(mtPayload.getString("instructedCurrency"));
        r.setInstructedAmount(mtPayload.getString("instructedAmount"));

        // SWIFT party fields
        r.setOrderingCustomer(mtPayload.getString("orderingCustomer"));
        r.setOrderingInstitution(mtPayload.getString("orderingInstitution"));
        r.setSenderCorrespondent(mtPayload.getString("senderCorrespondent"));
        r.setAccountWithInstitution(mtPayload.getString("accountWithInstitution"));
        r.setBeneficiaryCustomer(mtPayload.getString("beneficiaryCustomer"));

        // Fallback detailsOfCharges / remittanceInfo from mtPayload if not on top-level
        if (r.getDetailsOfCharges() == null) r.setDetailsOfCharges(mtPayload.getString("detailsOfCharges"));
        if (r.getRemittanceInfo()   == null) r.setRemittanceInfo(mtPayload.getString("remittanceInfo"));

        // Payload metadata
        Object fc = mtPayload.get("fieldCount");
        if (fc instanceof Number n) r.setPayloadFieldCount(n.intValue());
        r.setPayloadSize(mtPayload.getString("payloadSize"));

        // FIN header fallback — top-level takes priority, block1/block2 as fallback
        if (r.getApplicationId()           == null) r.setApplicationId(block1.getString("applicationId"));
        if (r.getServiceId()               == null) r.setServiceId(block1.getString("serviceId"));
        if (r.getLogicalTerminalAddress()  == null) r.setLogicalTerminalAddress(block1.getString("logicalTerminalAddress"));
        if (r.getMessagePriority()         == null) r.setMessagePriority(block2.getString("messagePriority"));
        if (r.getFinDirectionId()          == null) r.setFinDirectionId(block2.getString("directionId"));
        if (r.getFinMessageType()          == null) r.setFinMessageType(block2.getString("messageType"));
        if (r.getFinReceiversAddress()     == null) r.setFinReceiversAddress(block2.getString("receiverAddress"));

        // Raw FIN string
        r.setRawFin(mtPayload.getString("rawFin"));

        // block4Fields
        Object b4Raw = mtPayload.get("block4Fields");
        if (b4Raw instanceof List<?> b4List) {
            r.setBlock4Fields(b4List.stream()
                    .filter(e -> e instanceof Document)
                    .map(e -> new LinkedHashMap<String, Object>((Document) e))
                    .collect(Collectors.toList()));
        }

        // ── Full raw document for detail modal ────────────────────────────
        r.setRawMessage(new LinkedHashMap<>(doc));

        // ── UI aliases ────────────────────────────────────────────────────
        r.setFormat(r.getMessageType());
        r.setType(r.getMessageCode());
        r.setDate(dateOnly(r.getCreationDate()));
        r.setTime(timeOnly(r.getCreationDate()));
        r.setDirection(r.getIo());
        r.setNetwork(r.getNetworkProtocol());
        r.setOwnerUnit(r.getOwner());
        r.setCurrency(r.getCcy());
        r.setFinCopy(r.getFinCopyService());
        r.setSourceSystem(null);

        return r;
    }

    // ── Utilities ─────────────────────────────────────────────────────────
    private void parseIntStr(String s, java.util.function.Consumer<Integer> setter) {
        if (s == null) return;
        try { setter.accept(Integer.parseInt(s.trim())); } catch (NumberFormatException ignored) {}
    }
    private String dateOnly(String iso) {
        if (iso == null || iso.length() < 10) return null;
        return iso.substring(0, 10).replace("-", "/");
    }
    private String timeOnly(String iso) {
        if (iso == null || iso.length() < 19) return null;
        return iso.substring(11, 19);
    }
}