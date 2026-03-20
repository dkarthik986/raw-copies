import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import "./Search.css";
import "./RawCopies.css";
import { useAuth } from "../AuthContext";

// ── All API endpoints read from .env — no hardcoded URLs ─────────────────────
const API_BASE_URL      = `${process.env.REACT_APP_API_BASE_URL || "http://localhost:8080"}/api/search`;
const API_DROPDOWN_URL   = `${process.env.REACT_APP_API_BASE_URL || "http://localhost:8080"}/api/dropdown-options`;
const API_FIELD_CFG_URL  = `${process.env.REACT_APP_API_BASE_URL || "http://localhost:8080"}/api/search/field-config`;
const API_RAW_COPIES_URL = `${process.env.REACT_APP_API_BASE_URL || "http://localhost:8080"}/api/raw-copies`;

// ── MT/MX pair map ────────────────────────────────────────────────────────────
const BASE_MT_MX_PAIRS = {
    "MT103/pacs.008": ["MT103", "pacs.008"],
    "MT199/pacs.002": ["MT199", "pacs.002"],
    "MT202/pacs.009": ["MT202", "pacs.009"],
    "MT700/pain.001": ["MT700", "pain.001"],
    "MT940/camt.053": ["MT940", "camt.053"],
};
let allMtMxTypeMap = { ...BASE_MT_MX_PAIRS };

const addOneMonth = (dateStr) => {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("/").map(Number);
    const next = new Date(y, m, d);
    return `${next.getFullYear()}/${String(next.getMonth() + 1).padStart(2, "0")}/${String(next.getDate()).padStart(2, "0")}`;
};
const clampToOneMonth = (startStr, endStr) => {
    if (!startStr || !endStr) return endStr;
    const maxEnd = addOneMonth(startStr);
    return endStr > maxEnd ? maxEnd : endStr;
};
const normalizeFormat = (rawFormat) => {
    if (!rawFormat) return rawFormat;
    return rawFormat.replace("ALL-MT&MX", "ALL MT&MX");
};
const buildAllMtMxTypeMap = (backendPairs) => {
    const map = { ...BASE_MT_MX_PAIRS };
    if (backendPairs && backendPairs.length > 0) {
        backendPairs.forEach(label => {
            if (!map[label]) {
                const parts = label.split("/");
                if (parts.length === 2) map[label] = [parts[0].trim(), parts[1].trim()];
            }
        });
    }
    return map;
};
const getDisplayFormat = (msg) => normalizeFormat(msg.format);
const getDisplayType = (msg) => {
    if (normalizeFormat(msg.format) === "ALL MT&MX") {
        for (const [pairedLabel, individualTypes] of Object.entries(allMtMxTypeMap)) {
            if (individualTypes.includes(msg.type)) return pairedLabel;
        }
    }
    return msg.type;
};
const formatDirection = (val) => {
    if (!val) return "—";
    const v = String(val).trim().toUpperCase();
    if (v === "I") return "INCOMING";
    if (v === "O") return "OUTGOING";
    return v;
};
const dirClass = (val) => {
    if (!val) return "";
    const v = String(val).trim().toUpperCase();
    if (v === "I" || v === "INCOMING") return "dir-incoming";
    if (v === "O" || v === "OUTGOING") return "dir-outgoing";
    return "";
};
const statusCls = (s) => ({ ACCEPTED: "badge-ok", DELIVERED: "badge-ok", PENDING: "badge-pending", PROCESSING: "badge-pending", REPAIR: "badge-pending", REJECTED: "badge-bypass", FAILED: "badge-bypass" }[s] || "");

// ── Raw Copies helpers ────────────────────────────────────────────────────────
const rcStatusCls = (s) => {
    if (!s) return "rc-status rc-status-default";
    const u = s.toUpperCase();
    if (u.includes("OK") || u.includes("DISTRIBUTED") || u.includes("ACCEPTED") || u.includes("DELIVERED"))
        return "rc-status rc-status-ok";
    if (u.includes("PENDING") || u.includes("PROCESSING") || u.includes("PROGRESS"))
        return "rc-status rc-status-pending";
    if (u.includes("FAIL") || u.includes("REJECT") || u.includes("ERROR"))
        return "rc-status rc-status-fail";
    return "rc-status rc-status-default";
};
const rcDirCls = (d) => {
    if (!d) return "rc-dir rc-dir-rt";
    const u = d.toUpperCase();
    if (u === "INBOUND")  return "rc-dir rc-dir-in";
    if (u === "OUTBOUND") return "rc-dir rc-dir-out";
    return "rc-dir rc-dir-rt";
};
const fmtDate = (s) => {
    if (!s) return "—";
    try { return new Date(s).toLocaleString("en-US", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hour12: false }); }
    catch { return s; }
};

function highlight(text, search) {
    if (!search || !text) return text ?? "—";
    const str = String(text);
    const idx = str.toLowerCase().indexOf(search.toLowerCase());
    if (idx === -1) return str;
    return <>{str.slice(0, idx)}<mark className="hl">{str.slice(idx, idx + search.length)}</mark>{str.slice(idx + search.length)}</>;
}

// ── Table columns ─────────────────────────────────────────────────────────────
const COLUMNS = [
    { key: "sequenceNumber",      label: "Seq No.",         sortable: true },
    { key: "format",              label: "Format",          sortable: true },
    { key: "type",                label: "Type",            sortable: true },
    { key: "date",                label: "Date",            sortable: true },
    { key: "time",                label: "Time",            sortable: true },
    { key: "direction",           label: "Direction",       sortable: true },
    { key: "network",             label: "Network",         sortable: true },
    { key: "networkStatus",       label: "Network Status",  sortable: true },
    { key: "deliveryMode",        label: "Delivery Mode",   sortable: true },
    { key: "service",             label: "Service",         sortable: true },
    { key: "sourceSystem",        label: "Source System",   sortable: true },
    { key: "sender",              label: "Sender",          sortable: true },
    { key: "receiver",            label: "Receiver",        sortable: true },
    { key: "correspondent",       label: "Correspondent",   sortable: true },
    { key: "status",              label: "Status",          sortable: true },
    { key: "currency",            label: "Currency",        sortable: true },
    { key: "amount",              label: "Amount",          sortable: true },
    { key: "userReference",       label: "User Ref",        sortable: true },
    { key: "uetr",                label: "UETR",            sortable: true },
    { key: "finCopy",             label: "FIN-COPY",        sortable: true },
    { key: "action",              label: "Action",          sortable: true },
    { key: "reason",              label: "Reason",          sortable: true },
    { key: "ownerUnit",           label: "Owner/Unit",      sortable: true },
    { key: "phase",               label: "Phase",           sortable: true },
    { key: "backendChannel",      label: "Channel",         sortable: true },
    { key: "processingType",      label: "Proc. Type",      sortable: true },
    { key: "profileCode",         label: "Profile",         sortable: true },
    { key: "amlStatus",           label: "AML Status",      sortable: true },
    { key: "amlDetails",          label: "AML Details",     sortable: true },
    { key: "nack",                label: "NACK",            sortable: true },
    { key: "messagePriority",     label: "Msg Priority",    sortable: true },
    { key: "possibleDuplicate",   label: "Dup?",            sortable: true },
    { key: "crossBorder",         label: "Cross Border",    sortable: true },
    { key: "workflowModel",       label: "Workflow Model",  sortable: true },
    { key: "originCountry",       label: "Origin Country",  sortable: true },
    { key: "destinationCountry",  label: "Dest. Country",   sortable: true },
    { key: "valueDate",           label: "Value Date",      sortable: true },
    { key: "settlementDate",      label: "Settlement Date", sortable: true },
];

const FIELD_DEFINITIONS = [
    { key: "format",               label: "Message Format",          group: "Classification", type: "select",       optKey: "formats",                placeholder: "All Formats",        stateKeys: ["format"],                                   colKeys: ["format"],             backendParam: "messageType"           },
    { key: "type",                 label: "Message Type",            group: "Classification", type: "select-type",  optKey: null,                     placeholder: "All Types",          stateKeys: ["type"],                                     colKeys: ["type"],               backendParam: "messageCode"           },
    { key: "direction",            label: "Message Direction",       group: "Classification", type: "select",       optKey: "directions",             placeholder: "All Directions",     stateKeys: ["direction"],                                colKeys: ["direction"],          backendParam: "io"                    },
    { key: "status",               label: "Status",                  group: "Classification", type: "select",       optKey: "statuses",               placeholder: "All Statuses",       stateKeys: ["status"],                                   colKeys: ["status"],             backendParam: "status"                },
    { key: "messagePriority",      label: "Message Priority",        group: "Classification", type: "select",       optKey: "messagePriorities",      placeholder: "All Priorities",     stateKeys: ["messagePriority"],                          colKeys: ["messagePriority"],    backendParam: "messagePriority"       },
    { key: "copyIndicator",        label: "Copy Indicator",          group: "Classification", type: "select",       optKey: "copyIndicators",         placeholder: "All",                stateKeys: ["copyIndicator"],                            colKeys: [],                     backendParam: "copyIndicator"         },
    { key: "finCopy",              label: "FIN-COPY Service",        group: "Classification", type: "select",       optKey: "finCopyServices",        placeholder: "All",                stateKeys: ["finCopy"],                                  colKeys: ["finCopy"],            backendParam: "finCopyService"        },
    { key: "possibleDuplicate",    label: "Possible Duplicate",      group: "Classification", type: "select",       optKey: null,                     placeholder: "All",                stateKeys: ["possibleDuplicate"],                        colKeys: [],                     backendParam: "possibleDuplicate",  options: ["true","false"] },
    { key: "dateRange",            label: "Creation Date Range",     group: "Date & Time",    type: "date-range",   optKey: null,                     placeholder: null,                 stateKeys: ["startDate","startTime","endDate","endTime"], colKeys: ["date","time"],         backendParam: "startDate,endDate"     },
    { key: "valueDateRange",       label: "Value Date Range",        group: "Date & Time",    type: "date-range2",  optKey: null,                     placeholder: null,                 stateKeys: ["valueDateFrom","valueDateTo"],               colKeys: ["valueDate"],          backendParam: "valueDateFrom,valueDateTo" },
    { key: "receivedDateRange",    label: "Received Date Range",     group: "Date & Time",    type: "date-range2",  optKey: null,                     placeholder: null,                 stateKeys: ["receivedDateFrom","receivedDateTo"],         colKeys: ["receivedDT"],         backendParam: "receivedDateFrom,receivedDateTo" },
    { key: "statusDateRange",      label: "Status Date Range",       group: "Date & Time",    type: "date-range2",  optKey: null,                     placeholder: null,                 stateKeys: ["statusDateFrom","statusDateTo"],             colKeys: ["statusDate"],         backendParam: "statusDateFrom,statusDateTo" },
    { key: "sender",               label: "Sender BIC",              group: "Parties",        type: "text",         placeholder: "Enter Sender BIC",                               stateKeys: ["sender"],                                   colKeys: ["sender"],             backendParam: "sender"                },
    { key: "receiver",             label: "Receiver BIC",            group: "Parties",        type: "text",         placeholder: "Enter Receiver BIC",                             stateKeys: ["receiver"],                                 colKeys: ["receiver"],           backendParam: "receiver"              },
    { key: "correspondent",        label: "Correspondent",           group: "Parties",        type: "text",         placeholder: "Enter Correspondent BIC",                        stateKeys: ["correspondent"],                            colKeys: ["correspondent"],      backendParam: "correspondent"         },
    { key: "mur",                  label: "User Reference (MUR)",    group: "References",     type: "text",         placeholder: "MUR",                                            stateKeys: ["userReference"],                            colKeys: ["userReference"],      backendParam: "mur"                   },
    { key: "reference",            label: "Reference",               group: "References",     type: "text",         placeholder: "Reference",                                      stateKeys: ["reference"],                                colKeys: [],                     backendParam: "reference"             },
    { key: "transactionReference", label: "Transaction Reference",   group: "References",     type: "text",         placeholder: "Transaction Reference",                          stateKeys: ["transactionReference"],                     colKeys: [],                     backendParam: "transactionReference"  },
    { key: "transferReference",    label: "Transfer Reference",      group: "References",     type: "text",         placeholder: "Transfer Reference",                             stateKeys: ["transferReference"],                        colKeys: [],                     backendParam: "transferReference"     },
    { key: "relatedReference",     label: "Related Reference",       group: "References",     type: "text",         placeholder: "Related Reference",                              stateKeys: ["relatedReference"],                         colKeys: [],                     backendParam: "relatedReference"      },
    { key: "uetr",                 label: "UETR",                    group: "References",     type: "text",         placeholder: "Enter UETR (e.g. 8a562c65-...)",                 stateKeys: ["uetr"],                                     colKeys: ["uetr"],               backendParam: "uetr"                  },
    { key: "mxInputReference",     label: "MX Input Reference",      group: "References",     type: "text",         placeholder: "MX Input Reference",                             stateKeys: ["mxInputReference"],                         colKeys: [],                     backendParam: "mxInputReference"      },
    { key: "mxOutputReference",    label: "MX Output Reference",     group: "References",     type: "text",         placeholder: "MX Output Reference",                            stateKeys: ["mxOutputReference"],                        colKeys: [],                     backendParam: "mxOutputReference"     },
    { key: "networkReference",     label: "Network Reference",       group: "References",     type: "text",         placeholder: "Network Reference",                              stateKeys: ["networkReference"],                         colKeys: [],                     backendParam: "networkReference"      },
    { key: "e2eMessageId",         label: "E2E Message ID",          group: "References",     type: "text",         placeholder: "End-to-End Message ID",                          stateKeys: ["e2eMessageId"],                             colKeys: [],                     backendParam: "e2eMessageId"          },
    { key: "seqRange",             label: "Sequence No. Range",      group: "References",     type: "seq-range",    placeholder: null,                                             stateKeys: ["seqFrom","seqTo"],                          colKeys: ["sequenceNumber"],     backendParam: "seqFrom,seqTo"         },
    { key: "amountRange",          label: "Amount Range",            group: "Financial",      type: "amount-range", placeholder: null,                                             stateKeys: ["amountFrom","amountTo"],                    colKeys: ["amount","currency"],  backendParam: "amountFrom,amountTo"   },
    { key: "currency",             label: "Currency (CCY)",          group: "Financial",      type: "select",       optKey: "currencies",             placeholder: "All Currencies",     stateKeys: ["currency"],                                 colKeys: ["currency"],           backendParam: "ccy"                   },
    { key: "network",              label: "Network Protocol",        group: "Routing",        type: "select",       optKey: "networks",               placeholder: "All Networks",       stateKeys: ["network"],                                  colKeys: ["network"],            backendParam: "networkProtocol"       },
    { key: "networkChannel",       label: "Network Channel",         group: "Routing",        type: "select",       optKey: "networkChannels",        placeholder: "All Channels",       stateKeys: ["networkChannel"],                           colKeys: ["backendChannel"],     backendParam: "networkChannel"        },
    { key: "networkPriority",      label: "Network Priority",        group: "Routing",        type: "select",       optKey: "networkPriorities",      placeholder: "All Priorities",     stateKeys: ["networkPriority"],                          colKeys: [],                     backendParam: "networkPriority"       },
    { key: "deliveryMode",         label: "Delivery Mode",           group: "Routing",        type: "select",       optKey: "deliveryModes",          placeholder: "All Modes",          stateKeys: ["deliveryMode"],                             colKeys: ["deliveryMode"],       backendParam: "deliveryMode"          },
    { key: "service",              label: "Service",                 group: "Routing",        type: "select",       optKey: "services",               placeholder: "All Services",       stateKeys: ["service"],                                  colKeys: ["service"],            backendParam: "service"               },
    { key: "country",              label: "Country",                 group: "Routing",        type: "select",       optKey: "countries",              placeholder: "All Countries",      stateKeys: ["country"],                                  colKeys: [],                     backendParam: "country"               },
    { key: "originCountry",        label: "Origin Country",          group: "Routing",        type: "select",       optKey: "originCountries",        placeholder: "All Countries",      stateKeys: ["originCountry"],                            colKeys: [],                     backendParam: "originCountry"         },
    { key: "destinationCountry",   label: "Destination Country",     group: "Routing",        type: "select",       optKey: "destinationCountries",   placeholder: "All Countries",      stateKeys: ["destinationCountry"],                       colKeys: [],                     backendParam: "destinationCountry"    },
    { key: "ownerUnit",            label: "Owner / Unit",            group: "Ownership",      type: "select",       optKey: "ownerUnits",             placeholder: "All Units",          stateKeys: ["ownerUnit"],                                colKeys: ["ownerUnit"],          backendParam: "owner"                 },
    { key: "workflow",             label: "Workflow",                group: "Ownership",      type: "select",       optKey: "workflows",              placeholder: "All Workflows",      stateKeys: ["workflow"],                                 colKeys: [],                     backendParam: "workflow"              },
    { key: "workflowModel",        label: "Workflow Model",          group: "Ownership",      type: "select",       optKey: "workflowModels",         placeholder: "All Models",         stateKeys: ["workflowModel"],                            colKeys: [],                     backendParam: "workflowModel"         },
    { key: "originatorApplication",label: "Originator Application",  group: "Ownership",      type: "select",       optKey: "originatorApplications", placeholder: "All Applications",   stateKeys: ["originatorApplication"],                    colKeys: [],                     backendParam: "originatorApplication" },
    { key: "phase",                label: "Phase",                   group: "Lifecycle",      type: "select",       optKey: "phases",                 placeholder: "All Phases",         stateKeys: ["phase"],                                    colKeys: ["phase"],              backendParam: "phase"                 },
    { key: "action",               label: "Action",                  group: "Lifecycle",      type: "select",       optKey: "actions",                placeholder: "All Actions",        stateKeys: ["action"],                                   colKeys: ["action"],             backendParam: "action"                },
    { key: "reason",               label: "Reason",                  group: "Lifecycle",      type: "select",       optKey: "reasons",                placeholder: "All Reasons",        stateKeys: ["reason"],                                   colKeys: ["reason"],             backendParam: "reason"                },
    { key: "processingType",       label: "Processing Type",         group: "Processing",     type: "select",       optKey: "processingTypes",        placeholder: "All Types",          stateKeys: ["processingType"],                           colKeys: ["processingType"],     backendParam: "processingType"        },
    { key: "processPriority",      label: "Process Priority",        group: "Processing",     type: "select",       optKey: "processPriorities",      placeholder: "All Priorities",     stateKeys: ["processPriority"],                          colKeys: [],                     backendParam: "processPriority"       },
    { key: "profileCode",          label: "Profile Code",            group: "Processing",     type: "select",       optKey: "profileCodes",           placeholder: "All Profiles",       stateKeys: ["profileCode"],                              colKeys: [],                     backendParam: "profileCode"           },
    { key: "environment",          label: "Environment",             group: "Processing",     type: "select",       optKey: "environments",           placeholder: "All Environments",   stateKeys: ["environment"],                              colKeys: [],                     backendParam: "environment"           },
    { key: "nack",                 label: "NACK Code",               group: "Processing",     type: "select",       optKey: "nackCodes",              placeholder: "All",                stateKeys: ["nack"],                                     colKeys: ["nack"],               backendParam: "nack"                  },
    { key: "amlStatus",            label: "AML Status",              group: "Compliance",     type: "select",       optKey: "amlStatuses",            placeholder: "All Statuses",       stateKeys: ["amlStatus"],                                colKeys: ["amlStatus"],          backendParam: "amlStatus"             },
    { key: "amlDetails",           label: "AML Details",             group: "Compliance",     type: "text",         placeholder: "AML reference...",                               stateKeys: ["amlDetails"],                               colKeys: ["amlDetails"],         backendParam: "amlDetails"            },
    { key: "historyEntity",        label: "History Entity",          group: "History",        type: "text",         placeholder: "e.g. Screening, Validation",                     stateKeys: ["historyEntity"],                            colKeys: [],                     backendParam: "historyEntity"         },
    { key: "historyDescription",   label: "History Comment",         group: "History",        type: "text",         placeholder: "Search history comments",                        stateKeys: ["historyDescription"],                       colKeys: [],                     backendParam: "historyDescription"    },
    { key: "historyPhase",         label: "History Phase",           group: "History",        type: "select",       optKey: "phases",         placeholder: "All Phases",          stateKeys: ["historyPhase"],                             colKeys: [],                     backendParam: "historyPhase"          },
    { key: "historyAction",        label: "History Action",          group: "History",        type: "select",       optKey: "actions",        placeholder: "All Actions",         stateKeys: ["historyAction"],                            colKeys: [],                     backendParam: "historyAction"         },
    { key: "historyUser",          label: "History User",            group: "History",        type: "text",         placeholder: "e.g. SYS_USER_01",                               stateKeys: ["historyUser"],                              colKeys: [],                     backendParam: "historyUser"           },
    { key: "historyChannel",       label: "History Channel",         group: "History",        type: "text",         placeholder: "e.g. ADCBGBS0",                                  stateKeys: ["historyChannel"],                           colKeys: [],                     backendParam: "historyChannel"        },
    { key: "block4Value",          label: "Payload Field Value",     group: "Payload",        type: "text-wide",    placeholder: "Search in raw FIN fields",                       stateKeys: ["block4Value"],                              colKeys: [],                     backendParam: "block4Value"           },
    { key: "freeSearchText",       label: "Free Search Text",        group: "Other",          type: "text-wide",    placeholder: "Searches across all fields...",                  stateKeys: ["freeSearchText"],                           colKeys: [],                     backendParam: "freeSearchText"        },
];

const FIELD_GROUPS = ["Classification", "Date & Time", "Parties", "References", "Financial", "Routing", "Ownership", "Lifecycle", "Processing", "Compliance", "History", "Other"];
const ADV_BASE_COLS = new Set(["sequenceNumber", "format", "type", "date", "time"]);
const SORT_NONE = null, SORT_ASC = "asc", SORT_DESC = "desc";
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS   = ["Su","Mo","Tu","We","Th","Fr","Sa"];

const initialSearchState = {
    format:"", type:"", messageCode:"", startDate:"", startTime:"", endDate:"", endTime:"",
    direction:"", network:"", sender:"", receiver:"",
    status:"", currency:"", userReference:"", rfkReference:"",
    messageReference:"", uetr:"", finCopy:"", action:"", reason:"",
    correspondent:"", amountFrom:"", amountTo:"", seqFrom:"",
    seqTo:"", ownerUnit:"", freeSearchText:"", backendChannel:"", phase:"",
    country:"", workflow:"", networkChannel:"", networkPriority:"",
    reference:"", transactionReference:"", transferReference:"",
    historyEntity:"", historyDescription:"", historyPhase:"", historyAction:"", historyUser:"", historyChannel:"",
    block4Value:"",
    relatedReference:"", mxInputReference:"", mxOutputReference:"",
    networkReference:"", e2eMessageId:"",
    networkStatus:"", deliveryMode:"", service:"",
    originCountry:"", destinationCountry:"",
    workflowModel:"", originatorApplication:"",
    processingType:"", processPriority:"", profileCode:"", environment:"", nack:"",
    amlStatus:"", amlDetails:"",
    messagePriority:"", copyIndicator:"", possibleDuplicate:"", crossBorder:"",
    valueDateFrom:"", valueDateTo:"",
    receivedDateFrom:"", receivedDateTo:"",
    statusDateFrom:"", statusDateTo:"",
};

const initialRcFilters = {
    messageReference: "", messageId: "", sender: "", receiver: "",
    messageTypeCode: "", direction: "", currentStatus: "", protocol: "",
    inputType: "", source: "", isDuplicate: "", startDate: "", endDate: "", freeText: "",
};

const emptyOpts = {
    formats:[], types:[], mtTypes:[], mxTypes:[], allMtMxTypes:[],
    networks:[], sourceSystems:[], currencies:[], ownerUnits:[],
    backendChannels:[], directions:[], statuses:[], finCopies:[], actions:[], phases:[],
    messageCodes:[], senders:[], receivers:[], countries:[],
    workflows:[], networkChannels:[], networkPriorities:[], ioDirections:[],
    networkStatuses:[], deliveryModes:[], services:[],
    originCountries:[], destinationCountries:[],
    workflowModels:[], originatorApplications:[],
    processingTypes:[], processPriorities:[], profileCodes:[], environments:[],
    amlStatuses:[], nackCodes:[], messagePriorities:[], copyIndicators:[],
    finCopyServices:[], reasons:[],
};


// ── DateTimePicker ─────────────────────────────────────────────────────────────
function DateTimePicker({ label, dateValue, timeValue, onDateChange, onTimeChange, onKeyDown }) {
    const [open, setOpen] = useState(false);
    const [viewYear, setViewYear] = useState(() => dateValue ? parseInt(dateValue.split("/")[0]) || new Date().getFullYear() : new Date().getFullYear());
    const [viewMonth, setViewMonth] = useState(() => dateValue ? (parseInt(dateValue.split("/")[1]) - 1) || new Date().getMonth() : new Date().getMonth());
    const [timeMode, setTimeMode] = useState(false);
    const [typedDate, setTypedDate] = useState(dateValue || "");
    const [dateError, setDateError] = useState(false);
    const ref = useRef(null);

    const isValidDate = useCallback((str) => {
        if (!str) return true;
        const m = str.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
        if (!m) return false;
        const [, y, mo, d] = m.map(Number);
        if (mo < 1 || mo > 12) return false;
        return d >= 1 && d <= new Date(y, mo, 0).getDate();
    }, []);

    const commitDate = useCallback((v) => {
        if (!v) { onDateChange(""); setDateError(false); return; }
        if (isValidDate(v)) { onDateChange(v); setDateError(false); }
        else setDateError(true);
    }, [onDateChange, isValidDate]);

    useEffect(() => { setTypedDate(dateValue || ""); }, [dateValue]);
    useEffect(() => {
        const handle = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setTimeMode(false); commitDate(typedDate); } };
        document.addEventListener("mousedown", handle);
        return () => document.removeEventListener("mousedown", handle);
    }, [typedDate, commitDate]);
    useEffect(() => {
        if (dateValue) {
            const p = dateValue.split("/");
            if (p[0] && parseInt(p[0]) > 999) setViewYear(parseInt(p[0]));
            if (p[1]) setViewMonth(parseInt(p[1]) - 1);
        }
    }, [dateValue]);

    const handleDateTyping = (raw) => {
        let v = raw.replace(/[^\d/]/g, "");
        if (v.length === 4 && !v.includes("/")) v += "/";
        else if (v.length === 7 && v.split("/").length === 2) v += "/";
        if (v.length > 10) v = v.slice(0, 10);
        setTypedDate(v); setDateError(false);
        if (v.length === 10) commitDate(v);
    };
    const handleDateKey = (e) => {
        if (e.key === "Enter") { commitDate(typedDate); if (onKeyDown) onKeyDown(e); }
        if (e.key === "Tab") commitDate(typedDate);
    };
    const handleClearAll = (e) => { e.stopPropagation(); setTypedDate(""); setDateError(false); onDateChange(""); onTimeChange(""); };

    const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
    const getFirstDay    = (y, m) => new Date(y, m, 1).getDay();
    const selectedDay    = dateValue ? parseInt(dateValue.split("/")[2]) : null;
    const selectedMonth  = dateValue ? parseInt(dateValue.split("/")[1]) - 1 : null;
    const selectedYear   = dateValue ? parseInt(dateValue.split("/")[0]) : null;

    const handleDayClick = (day) => {
        const d = String(day).padStart(2,"0"), mo = String(viewMonth+1).padStart(2,"0");
        const newDate = `${viewYear}/${mo}/${d}`;
        setTypedDate(newDate); onDateChange(newDate); setDateError(false); setTimeMode(true);
    };
    const prevMonth = () => { if (viewMonth===0){setViewMonth(11);setViewYear(y=>y-1);}else setViewMonth(m=>m-1); };
    const nextMonth = () => { if (viewMonth===11){setViewMonth(0);setViewYear(y=>y+1);}else setViewMonth(m=>m+1); };

    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstDay    = getFirstDay(viewYear, viewMonth);
    const today       = new Date();
    const todayY = today.getFullYear(), todayM = today.getMonth(), todayD = today.getDate();

    const [hh, mm, ss] = (timeValue || "").split(":");
    const setHH = (v) => onTimeChange(`${String(v).padStart(2,"0")}:${mm||"00"}:${ss||"00"}`);
    const setMM = (v) => onTimeChange(`${hh||"00"}:${String(v).padStart(2,"0")}:${ss||"00"}`);
    const setSS = (v) => onTimeChange(`${hh||"00"}:${mm||"00"}:${String(v).padStart(2,"0")}`);

    return (
        <div className="dtp-wrap" ref={ref}>
            {label && <label>{label}</label>}
            <div className={`dtp-input-row${open?" dtp-row-open":""}`}>
                <div className={`dtp-segment${dateError?" dtp-segment-error":""}`}>
                    <svg className="dtp-seg-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    <input className="dtp-type-input" placeholder="YYYY/MM/DD" value={typedDate} maxLength={10} onChange={e=>handleDateTyping(e.target.value)} onKeyDown={handleDateKey} onBlur={()=>commitDate(typedDate)} autoComplete="off" spellCheck={false}/>
                    {dateError && <span className="dtp-error-dot" title="Invalid date"/>}
                </div>
                {timeValue && (<><span className="dtp-seg-sep">·</span><div className="dtp-time-badge" onClick={()=>{setOpen(true);setTimeMode(true);}}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>{timeValue}</span></div></>)}
                <div className="dtp-seg-actions">
                    {(dateValue||timeValue) && <button className="dtp-clear-btn" onClick={handleClearAll} tabIndex={-1}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
                    <button className={`dtp-cal-toggle${open?" dtp-cal-toggle-active":""}`} onClick={()=>setOpen(p=>!p)} tabIndex={-1}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button>
                </div>
            </div>
            {open && (
                <div className="dtp-dropdown">
                    <div className="dtp-tab-row">
                        <button className={`dtp-tab${!timeMode?" dtp-tab-active":""}`} onClick={()=>setTimeMode(false)}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>Date</button>
                        <button className={`dtp-tab${timeMode?" dtp-tab-active":""}`} onClick={()=>setTimeMode(true)}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Time</button>
                    </div>
                    {!timeMode ? (
                        <div className="dtp-calendar">
                            <div className="dtp-cal-nav"><button className="dtp-nav-btn" onClick={prevMonth}>‹</button><span className="dtp-cal-title">{MONTHS[viewMonth]} {viewYear}</span><button className="dtp-nav-btn" onClick={nextMonth}>›</button></div>
                            <div className="dtp-year-row"><button className="dtp-year-step" onClick={()=>setViewYear(y=>y-1)}>«</button><span className="dtp-year-val">{viewYear}</span><button className="dtp-year-step" onClick={()=>setViewYear(y=>y+1)}>»</button></div>
                            <div className="dtp-day-grid">
                                {DAYS.map(d=><span key={d} className="dtp-day-hdr">{d}</span>)}
                                {Array.from({length:firstDay}).map((_,i)=><span key={`e${i}`}/>)}
                                {Array.from({length:daysInMonth}).map((_,i)=>{
                                    const day=i+1;
                                    const isSel=day===selectedDay&&viewMonth===selectedMonth&&viewYear===selectedYear;
                                    const isToday=day===todayD&&viewMonth===todayM&&viewYear===todayY;
                                    return <button key={day} className={`dtp-day${isSel?" dtp-day-selected":""}${isToday&&!isSel?" dtp-day-today":""}`} onClick={()=>handleDayClick(day)}>{day}</button>;
                                })}
                            </div>
                            <div className="dtp-cal-footer">
                                <button className="dtp-today-btn" onClick={()=>{setViewYear(todayY);setViewMonth(todayM);handleDayClick(todayD);}}>Today</button>
                                {dateValue&&<button className="dtp-time-btn" onClick={()=>setTimeMode(true)}>Set Time →</button>}
                            </div>
                        </div>
                    ) : (
                        <div className="dtp-time-panel">
                            <div className="dtp-time-header"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Set Time <span className="dtp-time-optional">(optional)</span></div>
                            <div className="dtp-time-cols">
                                {[["HH",hh,0,23,setHH],["MM",mm,0,59,setMM],["SS",ss,0,59,setSS]].map(([lbl,val,min,max,setter],idx)=>(
                                    <React.Fragment key={lbl}>
                                        {idx>0&&<span className="dtp-time-colon">:</span>}
                                        <div className="dtp-time-col">
                                            <span className="dtp-time-lbl">{lbl}</span>
                                            <button className="dtp-spin-btn" onClick={()=>setter(Math.min(max,parseInt(val||0)+1))}>▲</button>
                                            <input className="dtp-time-input" type="number" min={min} max={max} value={val||""} placeholder="00" onChange={e=>setter(Math.max(min,Math.min(max,parseInt(e.target.value)||0)))}/>
                                            <button className="dtp-spin-btn" onClick={()=>setter(Math.max(min,parseInt(val||0)-1))}>▼</button>
                                        </div>
                                    </React.Fragment>
                                ))}
                            </div>
                            <div className="dtp-time-presets">
                                {[["Start of Day","00:00:00"],["End of Day","23:59:59"],["Noon","12:00:00"]].map(([lbl,val])=>(
                                    <button key={lbl} className="dtp-preset-btn" onClick={()=>onTimeChange(val)}>{lbl}</button>
                                ))}
                            </div>
                            <div className="dtp-time-footer">
                                <button className="dtp-back-btn" onClick={()=>setTimeMode(false)}>← Back to Calendar</button>
                                <button className="dtp-done-btn" onClick={()=>{setOpen(false);setTimeMode(false);}}>Done</button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}


// ── Dynamic Select ─────────────────────────────────────────────────────────────
function DynSelect({ value, onChange, placeholder, options, loading }) {
    return (
        <select value={value} onChange={onChange} disabled={loading}>
            <option value="">{loading ? "Loading..." : placeholder}</option>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
    );
}


function FloatingModal({
    modal,
    processed,
    onClose,
    onBringToFront,
    onPatch,
    onPrev,
    onNext,
    getDisplayFormat,
    getDisplayType,
    statusCls,
    dirClass,
    formatDirection,
}) {
    const boxRef   = useRef(null);
    const dragRef  = useRef(null);
    const resRef   = useRef(null);
    const livePos  = useRef({ x: modal.pos.x,  y: modal.pos.y  });
    const liveSize = useRef({ w: modal.size.w, h: modal.size.h });

    const { id, msg, tab, pos, size, zIndex, index, _flash } = modal;

    // Flash animation when duplicate window is focused
    useEffect(() => {
        if (!_flash || !boxRef.current) return;
        const el = boxRef.current;
        el.style.transition = "box-shadow 0.08s ease-in-out";
        el.style.boxShadow  = "0 0 0 3px var(--accent), 0 20px 60px rgba(0,0,0,0.35)";
        const t = setTimeout(() => {
            el.style.boxShadow = "";
            el.style.transition = "";
        }, 500);
        return () => clearTimeout(t);
    }, [_flash]);
    const isFirst = index <= 0;
    const isLast  = index >= processed.length - 1;

    // Sync live refs only when React state changes (not during drag)
    useEffect(() => {
        livePos.current  = { x: pos.x,  y: pos.y  };
        liveSize.current = { w: size.w, h: size.h };
    }, [pos.x, pos.y, size.w, size.h]);

    // Direct DOM update — zero React involvement, zero re-renders, zero blink
    const applyDOM = (x, y, w, h) => {
        const el = boxRef.current;
        if (!el) return;
        el.style.left   = x + "px";
        el.style.top    = y + "px";
        el.style.width  = w + "px";
        el.style.height = h + "px";
        const body = el.querySelector(".fm-body");
        if (body) body.style.height = Math.max(80, h - 170) + "px";
    };

    // ── Drag ─────────────────────────────────────────────────────────────
    const onDragStart = (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        // z-index update via direct DOM — no React state
        const el = boxRef.current;
        if (el) el.style.zIndex = (parseInt(el.style.zIndex || 1000) + 1);
        dragRef.current = {
            ox: e.clientX - livePos.current.x,
            oy: e.clientY - livePos.current.y,
        };
        document.body.style.userSelect = "none";
        document.body.style.cursor     = "grabbing";

        const onMove = (ev) => {
            if (!dragRef.current) return;
            const nx = ev.clientX - dragRef.current.ox;
            const ny = ev.clientY - dragRef.current.oy;
            const cx = Math.max(0, Math.min(window.innerWidth  - liveSize.current.w, nx));
            const cy = Math.max(0, Math.min(window.innerHeight - 60, ny));
            livePos.current = { x: cx, y: cy };
            applyDOM(cx, cy, liveSize.current.w, liveSize.current.h);
        };
        const onUp = () => {
            if (!dragRef.current) return;
            dragRef.current = null;
            document.body.style.userSelect = "";
            document.body.style.cursor     = "";
            // Commit final position to React state ONCE on mouseup
            onPatch(id, { pos: { ...livePos.current } });
            // Sync z-index to React state once too
            const z = el ? parseInt(el.style.zIndex) : 1001;
            onBringToFront(id, z);
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup",   onUp);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup",   onUp);
    };

    // ── Resize ────────────────────────────────────────────────────────────
    const MIN_W = 500, MIN_H = 360;

    const onResizeStart = (e, dir) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        resRef.current = {
            sx: e.clientX, sy: e.clientY,
            sw: liveSize.current.w, sh: liveSize.current.h,
            spx: livePos.current.x, spy: livePos.current.y,
            dir,
        };
        document.body.style.userSelect = "none";

        const onMove = (ev) => {
            if (!resRef.current) return;
            const { sx, sy, sw, sh, spx, spy, dir: d } = resRef.current;
            const dx = ev.clientX - sx, dy = ev.clientY - sy;
            let nw = sw, nh = sh, nx = spx, ny = spy;
            if (d.includes("e")) nw = Math.max(MIN_W, sw + dx);
            if (d.includes("s")) nh = Math.max(MIN_H, sh + dy);
            if (d.includes("w")) { nw = Math.max(MIN_W, sw - dx); nx = spx + (sw - nw); }
            if (d.includes("n")) { nh = Math.max(MIN_H, sh - dy); ny = spy + (sh - nh); }
            liveSize.current = { w: nw, h: nh };
            livePos.current  = { x: nx, y: ny };
            applyDOM(nx, ny, nw, nh);
        };
        const onUp = () => {
            if (!resRef.current) return;
            resRef.current = null;
            document.body.style.userSelect = "";
            // Commit ONCE on mouseup
            onPatch(id, {
                pos:  { ...livePos.current  },
                size: { ...liveSize.current },
            });
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup",   onUp);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup",   onUp);
    };

    const handles = [
        { d:"n",  s:{top:0,left:8,right:8,height:6,cursor:"n-resize"} },
        { d:"s",  s:{bottom:0,left:8,right:8,height:6,cursor:"s-resize"} },
        { d:"e",  s:{right:0,top:8,bottom:8,width:6,cursor:"e-resize"} },
        { d:"w",  s:{left:0,top:8,bottom:8,width:6,cursor:"w-resize"} },
        { d:"ne", s:{top:0,right:0,width:14,height:14,cursor:"ne-resize"} },
        { d:"nw", s:{top:0,left:0,width:14,height:14,cursor:"nw-resize"} },
        { d:"se", s:{bottom:0,right:0,width:14,height:14,cursor:"se-resize"} },
        { d:"sw", s:{bottom:0,left:0,width:14,height:14,cursor:"sw-resize"} },
    ];

    const bodyH = Math.max(80, size.h - 170);

    // Bring to front on window click — direct DOM only, no state
    const handleWindowMouseDown = () => {
        const el = boxRef.current;
        if (el) el.style.zIndex = (parseInt(el.style.zIndex || 1000) + 1);
    };

    return (
        <div
            ref={boxRef}
            className="fm-window"
            style={{ left: pos.x, top: pos.y, width: size.w, height: size.h, zIndex }}
            onMouseDown={handleWindowMouseDown}
        >
            {handles.map(h => (
                <div key={h.d} className="fm-resize-handle"
                    style={{ position:"absolute", zIndex:5, ...h.s }}
                    onMouseDown={e => onResizeStart(e, h.d)}
                />
            ))}

            <div className="txn-header fm-drag-header" onMouseDown={onDragStart}>
                <div className="txn-header-left">
                    <div className="txn-type-pill">{getDisplayFormat(msg)}</div>
                    <div>
                        <div className="txn-title">{getDisplayType(msg)||"Transaction"}</div>
                        <div className="txn-subtitle">{msg.date}{msg.time&&<span> · {msg.time}</span>}</div>
                    </div>
                </div>
                <div className="txn-header-right" onMouseDown={e => e.stopPropagation()}>
                    <span className={"txn-status-badge "+statusCls(msg.status)}>{msg.status||"—"}</span>
                    <div className="txn-nav">
                        <button className="txn-nav-btn" onClick={()=>onPrev(id)} disabled={isFirst}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                        </button>
                        <span className="txn-nav-count">{index+1}/{processed.length}</span>
                        <button className="txn-nav-btn" onClick={()=>onNext(id)} disabled={isLast}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                        </button>
                    </div>
                    <button className="txn-close" onClick={()=>onClose(id)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
            </div>

            <div className="txn-summary-strip">
                <div className="txn-summary-item"><span className="txn-sum-label">Sender</span><span className="txn-sum-value mono">{msg.sender||"—"}</span></div>
                <div className="txn-summary-arrow"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></div>
                <div className="txn-summary-item"><span className="txn-sum-label">Receiver</span><span className="txn-sum-value mono">{msg.receiver||"—"}</span></div>
                <div className="txn-summary-divider"/>
                <div className="txn-summary-item"><span className="txn-sum-label">Country</span><span className="txn-sum-value">{msg.country||"—"}</span></div>
                <div className="txn-summary-divider"/>
                <div className="txn-summary-item"><span className="txn-sum-label">Owner</span><span className="txn-sum-value">{msg.owner||msg.ownerUnit||"—"}</span></div>
                <div className="txn-summary-divider"/>
                <div className="txn-summary-item"><span className="txn-sum-label">Network</span><span className="txn-sum-value">{msg.networkProtocol||msg.network||"—"}</span></div>
                <div className="txn-summary-item"><span className="txn-sum-label">Direction</span><span className={"dir-badge "+dirClass(msg.io||msg.direction)}>{formatDirection(msg.io||msg.direction)}</span></div>
            </div>

            <div className="txn-tabs">
                {[{key:"header",label:"Header"},{key:"body",label:"Body"},{key:"history",label:"History"},{key:"payload",label:"FIN Payload"},{key:"details",label:"All Fields"}].map(t=>(
                    <button key={t.key}
                        className={"txn-tab"+(tab===t.key?" txn-tab-active":"")}
                        onClick={()=>onPatch(id,{tab:t.key})}
                    >
                        {t.label}
                        {t.key==="history"&&(msg.historyLines||msg.rawMessage?.historyLines||[]).length
                            ?<span className="txn-tab-count">{(msg.historyLines||msg.rawMessage?.historyLines||[]).length}</span>:null}
                        {t.key==="payload"&&(msg.block4Fields||msg.rawMessage?.mtPayload?.block4Fields||[]).length
                            ?<span className="txn-tab-count">{(msg.block4Fields||msg.rawMessage?.mtPayload?.block4Fields||[]).length}</span>:null}
                    </button>
                ))}
            </div>

            <div className="txn-body fm-body" style={{height:bodyH,overflowY:"auto",overflowX:"hidden"}}>
                {tab==="header"&&<div className="txn-section-wrap">
                    <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:12}}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--gray-3)" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                        <span style={{fontSize:11,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:"var(--gray-3)"}}>Parties</span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 40px 1fr",alignItems:"stretch",marginBottom:24,border:"1px solid var(--gray-6)",borderRadius:8,overflow:"hidden"}}>
                        <div style={{padding:"16px 18px",background:"var(--white)"}}>
                            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                                <span style={{width:8,height:8,borderRadius:"50%",background:"#3b82f6",display:"inline-block",flexShrink:0}}/>
                                <span style={{fontSize:10,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",color:"var(--gray-3)"}}>Sender</span>
                            </div>
                            <div style={{fontSize:16,fontWeight:700,color:"var(--black)",fontFamily:"var(--mono)",letterSpacing:"0.02em",marginBottom:4}}>{msg.sender||"—"}</div>
                            <div style={{fontSize:13,color:"var(--gray-2)",marginBottom:4}}>{msg.rawMessage?.senderInstitutionName||""}</div>
                            <div style={{fontSize:11,color:"var(--gray-4)"}}>Financial Institution</div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"center",borderLeft:"1px solid var(--gray-6)",borderRight:"1px solid var(--gray-6)",background:"var(--gray-7)"}}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gray-4)" strokeWidth="1.8" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/></svg>
                        </div>
                        <div style={{padding:"16px 18px",background:"var(--white)"}}>
                            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                                <span style={{width:8,height:8,borderRadius:"50%",background:"#22c55e",display:"inline-block",flexShrink:0}}/>
                                <span style={{fontSize:10,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",color:"var(--gray-3)"}}>Receiver</span>
                            </div>
                            <div style={{fontSize:16,fontWeight:700,color:"var(--black)",fontFamily:"var(--mono)",letterSpacing:"0.02em",marginBottom:4}}>{msg.receiver||"—"}</div>
                            <div style={{fontSize:13,color:"var(--gray-2)",marginBottom:4}}>{msg.rawMessage?.receiverInstitutionName||""}</div>
                            <div style={{fontSize:11,color:"var(--gray-4)"}}>Financial Institution</div>
                        </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:12}}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--gray-3)" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                        <span style={{fontSize:11,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:"var(--gray-3)"}}>Message Details</span>
                    </div>
                    <div style={{border:"1px solid var(--gray-6)",borderRadius:8,overflow:"hidden"}}>
                        {[
                            ["MESSAGE CODE",          msg.messageCode||getDisplayType(msg),                false],
                            ["MESSAGE FORMAT",        msg.rawMessage?.messageFormat||getDisplayFormat(msg),false],
                            ["REFERENCE",             msg.reference,                                       true],
                            ["TRANSACTION REFERENCE", msg.transactionReference,                            true],
                            ["TRANSFER REFERENCE",    msg.transferReference,                               true],
                            ["MUR",                   msg.mur||msg.userReference,                         true],
                            ["CREATION DATE",         msg.creationDate||msg.date,                         true],
                            ["RECEIVED",              msg.receivedDT,                                      true],
                            ["REMITTANCE",            msg.remittanceInfo,                                  false],
                            ["UETR",                  msg.uetr,                                            true],
                            ["WORKFLOW",              msg.workflow,                                        false],
                            ["ENVIRONMENT",           msg.environment,                                     false],
                            ["STATUS MESSAGE",        msg.statusMessage,                                   false],
                        ].filter(([,v])=>v).map(([label,val,mono],i)=>(
                            <div key={label} style={{display:"grid",gridTemplateColumns:"200px 1fr",borderBottom:i<12?"1px solid var(--gray-6)":"none",background:i%2===0?"var(--white)":"var(--gray-7)"}}>
                                <div style={{padding:"11px 16px",fontSize:11,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",color:"var(--gray-3)",borderRight:"1px solid var(--gray-6)",display:"flex",alignItems:"center"}}>{label}</div>
                                <div style={{padding:"11px 16px",fontSize:13,color:"var(--black)",fontFamily:mono?"monospace":"inherit",wordBreak:"break-all",display:"flex",alignItems:"center"}}>{val||"—"}</div>
                            </div>
                        ))}
                    </div>
                </div>}

                {tab==="body"&&<div className="txn-section-wrap"><div className="txn-fields-grid">
                    <div className="txn-field"><span className="txn-field-label">Message Code</span><span className="txn-field-value">{msg.messageCode||getDisplayType(msg)||"—"}</span></div>
                    <div className="txn-field"><span className="txn-field-label">Message Type</span><span className="txn-field-value">{getDisplayFormat(msg)||"—"}</span></div>
                    <div className="txn-field"><span className="txn-field-label">Network Protocol</span><span className="txn-field-value">{msg.networkProtocol||msg.network||"—"}</span></div>
                    <div className="txn-field"><span className="txn-field-label">Network Channel</span><span className="txn-field-value">{msg.networkChannel||msg.backendChannel||"—"}</span></div>
                    <div className="txn-field"><span className="txn-field-label">Network Priority</span><span className="txn-field-value">{msg.networkPriority||"—"}</span></div>
                    <div className="txn-field"><span className="txn-field-label">Country</span><span className="txn-field-value">{msg.country||"—"}</span></div>
                    <div className="txn-field"><span className="txn-field-label">Owner</span><span className="txn-field-value">{msg.owner||msg.ownerUnit||"—"}</span></div>
                    <div className="txn-field"><span className="txn-field-label">Workflow</span><span className="txn-field-value">{msg.workflow||"—"}</span></div>
                    <div className="txn-field"><span className="txn-field-label">Direction</span><span className={"txn-field-value dir-badge "+dirClass(msg.io||msg.direction)}>{formatDirection(msg.io||msg.direction)}</span></div>
                    <div className="txn-field"><span className="txn-field-label">Status</span><span className={"txn-field-value "+statusCls(msg.status)}>{msg.status||"—"}</span></div>
                    <div className="txn-field"><span className="txn-field-label">Phase</span><span className="txn-field-value">{msg.phase||"—"}</span></div>
                    <div className="txn-field"><span className="txn-field-label">Action</span><span className="txn-field-value">{msg.action||"—"}</span></div>
                    <div className="txn-field"><span className="txn-field-label">Reason</span><span className="txn-field-value">{msg.reason||"—"}</span></div>
                    <div className="txn-field"><span className="txn-field-label">Environment</span><span className="txn-field-value">{msg.environment||"—"}</span></div>
                    <div className="txn-field"><span className="txn-field-label">Session No.</span><span className="txn-field-value mono">{msg.sessionNumber||"—"}</span></div>
                    <div className="txn-field"><span className="txn-field-label">Sequence No.</span><span className="txn-field-value mono">{msg.sequenceNumber||"—"}</span></div>
                </div></div>}

                {tab==="history"&&<div className="txn-section-wrap">
                    {(()=>{
                        const lines = msg.historyLines || msg.rawMessage?.historyLines || [];
                        if(lines.length===0) return <div className="adv-empty-state"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--gray-4)" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><p>No history lines available</p></div>;
                        return (
                            <div style={{overflowX:"auto"}}>
                                <table className="history-table" style={{width:"max-content",minWidth:"100%",borderCollapse:"collapse",fontSize:13,tableLayout:"auto"}}>
                                    <thead style={{position:"sticky",top:0,zIndex:10}}>
                                        <tr style={{background:"var(--gray-7)",borderBottom:"2px solid var(--gray-5)"}}>
                                            <th style={{padding:"12px 16px",textAlign:"center",fontWeight:600,color:"var(--gray-2)",whiteSpace:"nowrap",minWidth:40}}>#</th>
                                            <th style={{padding:"12px 16px",textAlign:"left",fontWeight:600,color:"var(--gray-2)",whiteSpace:"nowrap",minWidth:180}}>Date & Time</th>
                                            <th style={{padding:"12px 16px",textAlign:"left",fontWeight:600,color:"var(--gray-2)",whiteSpace:"nowrap",minWidth:110}}>Phase</th>
                                            <th style={{padding:"12px 16px",textAlign:"left",fontWeight:600,color:"var(--gray-2)",whiteSpace:"nowrap",minWidth:110}}>Action</th>
                                            <th style={{padding:"12px 16px",textAlign:"left",fontWeight:600,color:"var(--gray-2)",whiteSpace:"nowrap",minWidth:100}}>Reason</th>
                                            <th style={{padding:"12px 16px",textAlign:"left",fontWeight:600,color:"var(--gray-2)",whiteSpace:"nowrap",minWidth:130}}>Entity</th>
                                            <th style={{padding:"12px 16px",textAlign:"left",fontWeight:600,color:"var(--gray-2)",whiteSpace:"nowrap",minWidth:120}}>Channel</th>
                                            <th style={{padding:"12px 16px",textAlign:"left",fontWeight:600,color:"var(--gray-2)",whiteSpace:"nowrap",minWidth:120}}>User</th>
                                            <th style={{padding:"12px 16px",textAlign:"left",fontWeight:600,color:"var(--gray-2)",whiteSpace:"nowrap",minWidth:280}}>Comment</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lines.map((line,idx)=>(
                                            <tr key={idx} style={{borderBottom:"1px solid var(--gray-6)",background:idx%2===0?"var(--white)":"var(--gray-7)"}}>
                                                <td style={{padding:"10px 16px",color:"var(--gray-2)",fontWeight:600,textAlign:"center"}}>{line.index||idx+1}</td>
                                                <td style={{padding:"10px 16px",fontFamily:"monospace",fontSize:12,color:"var(--black-3)",whiteSpace:"nowrap"}}>{line.historyDate?new Date(line.historyDate).toLocaleString("en-US",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:true}):"—"}</td>
                                                <td style={{padding:"10px 16px",whiteSpace:"nowrap"}}>{line.phase?<span className="txn-status-badge" style={{fontSize:11,padding:"3px 9px"}}>{line.phase}</span>:"—"}</td>
                                                <td style={{padding:"10px 16px",whiteSpace:"nowrap"}}>{line.action?<span className={"txn-status-badge "+(line.action==="Delivered"?"badge-ok":line.action==="Rejected"?"badge-bypass":"badge-pending")} style={{fontSize:11,padding:"3px 9px"}}>{line.action}</span>:"—"}</td>
                                                <td style={{padding:"10px 16px",color:"var(--black-3)",whiteSpace:"nowrap"}}>{line.reason||"—"}</td>
                                                <td style={{padding:"10px 16px",whiteSpace:"nowrap"}}>{line.entity?<span className="txn-status-badge" style={{fontSize:11,padding:"3px 9px",background:"var(--accent-light)",color:"var(--accent)"}}>{line.entity}</span>:"—"}</td>
                                                <td style={{padding:"10px 16px",fontFamily:"monospace",fontSize:12,color:"var(--black-3)",whiteSpace:"nowrap"}}>{line.channel||"—"}</td>
                                                <td style={{padding:"10px 16px",color:"var(--black-3)",whiteSpace:"nowrap"}}>{line.user||"—"}</td>
                                                <td style={{padding:"10px 16px",color:"var(--black-3)",maxWidth:320,wordBreak:"break-word"}}>{line.comment||"—"}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })()}
                </div>}

                {tab==="payload"&&<div className="txn-section-wrap">
                    {(()=>{
                        const lines = msg.block4Fields || msg.rawMessage?.mtPayload?.block4Fields || [];
                        if(lines.length===0) return <div className="adv-empty-state"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--gray-4)" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><p>No FIN payload fields available</p></div>;
                        return (
                            <div style={{overflowX:"auto"}}>
                                <table className="history-table" style={{width:"max-content",minWidth:"100%",borderCollapse:"collapse",fontSize:13,tableLayout:"auto"}}>
                                    <thead style={{position:"sticky",top:0,zIndex:10}}>
                                        <tr style={{background:"var(--gray-7)",borderBottom:"2px solid var(--gray-5)"}}>
                                            <th style={{padding:"12px 16px",textAlign:"center",fontWeight:600,color:"var(--gray-2)",whiteSpace:"nowrap",minWidth:40}}>#</th>
                                            <th style={{padding:"12px 16px",textAlign:"left",fontWeight:600,color:"var(--gray-2)",whiteSpace:"nowrap",minWidth:60}}>Tag</th>
                                            <th style={{padding:"12px 16px",textAlign:"left",fontWeight:600,color:"var(--gray-2)",whiteSpace:"nowrap",minWidth:220}}>Field Label</th>
                                            <th style={{padding:"12px 16px",textAlign:"left",fontWeight:600,color:"var(--gray-2)",whiteSpace:"nowrap",minWidth:300}}>Raw Value</th>
                                            <th style={{padding:"12px 16px",textAlign:"left",fontWeight:600,color:"var(--gray-2)",whiteSpace:"nowrap",minWidth:280}}>Components</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lines.map((line,idx)=>(
                                            <tr key={idx} style={{borderBottom:"1px solid var(--gray-6)",background:idx%2===0?"var(--white)":"var(--gray-7)"}}>
                                                <td style={{padding:"10px 16px",color:"var(--gray-2)",fontWeight:600,textAlign:"center"}}>{idx+1}</td>
                                                <td style={{padding:"10px 16px",whiteSpace:"nowrap"}}>
                                                    <span className="txn-status-badge" style={{fontSize:11,padding:"3px 8px",fontFamily:"monospace",letterSpacing:"0.04em"}}>{line.tag||"—"}</span>
                                                </td>
                                                <td style={{padding:"10px 16px",color:"var(--black-3)",whiteSpace:"nowrap"}}>{line.label||"—"}</td>
                                                <td style={{padding:"10px 16px",fontFamily:"monospace",fontSize:11,color:"var(--black-3)",whiteSpace:"pre-wrap",wordBreak:"break-all",maxWidth:320}}>{line.rawValue||"—"}</td>
                                                <td style={{padding:"10px 16px",fontSize:11,color:"var(--gray-2)"}}>
                                                    {line.components&&Object.keys(line.components).length>0
                                                        ?<div style={{display:"flex",flexDirection:"column",gap:2}}>
                                                            {Object.entries(line.components).map(([ck,cv])=>(
                                                                <div key={ck} style={{display:"flex",gap:6}}>
                                                                    <span style={{color:"var(--gray-4)",minWidth:80,fontWeight:500}}>{ck}:</span>
                                                                    <span style={{fontFamily:"monospace",wordBreak:"break-all"}}>{String(cv||"")}</span>
                                                                </div>
                                                            ))}
                                                         </div>
                                                        :"—"
                                                    }
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })()}
                </div>}{tab==="details"&&<div className="txn-section-wrap">
                    {(()=>{
                        const raw=msg.rawMessage||{};
                        const ALL_FIELDS=[["id","ID"],["messageType","FORMAT"],["messageCode","TYPE"],["messageTypeDescription","DESCRIPTION"],["io","DIRECTION"],["status","STATUS"],["phase","PHASE"],["action","ACTION"],["reason","REASON"],["statusMessage","STATUS MESSAGE"],["statusChangeSource","STATUS SOURCE"],["statusDecision","STATUS DECISION"],["reference","MESSAGE REF"],["transactionReference","TXN REF"],["mur","MUR (TAG 20)"],["sender","SENDER"],["receiver","RECEIVER"],["senderInstitutionName","SENDER NAME"],["receiverInstitutionName","RECEIVER NAME"],["amount","AMOUNT"],["ccy","CURRENCY"],["valueDate","VALUE DATE"],["networkProtocol","PROTOCOL"],["networkChannel","NETWORK CHANNEL"],["networkPriority","NETWORK PRIORITY"],["deliveryMode","DELIVERY MODE"],["service","SERVICE"],["backendChannel","BACKEND CHANNEL"],["backendChannelProtocol","CHANNEL PROTOCOL"],["workflow","WORKFLOW"],["workflowModel","WORKFLOW MODEL"],["owner","OWNER"],["processingType","PROCESSING TYPE"],["processPriority","PROCESS PRIORITY"],["profileCode","PROFILE CODE"],["originatorApplication","ORIGINATOR APP"],["sessionNumber","SESSION NO"],["sequenceNumber","SEQUENCE NO"],["creationDate","CREATED"],["receivedDT","RECEIVED"],["statusDate","STATUS DATE"],["valueDate","VALUE DATE"],["bankOperationCode","BANK OP CODE"],["detailsOfCharges","CHARGES"],["remittanceInfo","REMITTANCE"],["applicationId","APP ID"],["serviceId","SERVICE ID"],["logicalTerminalAddress","LOGICAL TERMINAL"],["messagePriority","MSG PRIORITY"],["pdeIndication","PDE"],["bulkType","BULK TYPE"],["nrIndicator","NR IND"],["channelCode","CHANNEL CODE"]];
                        const shown=new Set(),ordered=[];
                        ALL_FIELDS.forEach(([k,label])=>{const val=raw[k]??msg[k];if(val!==undefined&&val!==null&&val!==""){ordered.push({key:k,label,val});shown.add(k);}});
                        Object.entries(raw).forEach(([k,v])=>{if(!shown.has(k)&&k!=="mtPayload"&&k!=="block4Fields"&&k!=="rawFin"&&v!==undefined&&v!==null&&v!=="")ordered.push({key:k,label:k.toUpperCase(),val:v});});
                        if(!ordered.length) return <div style={{padding:40,textAlign:"center",color:"var(--gray-3)"}}><p>No fields available</p></div>;
                        const monoKeys=new Set(["id","mur","uetr","reference","transactionReference","creationDate","receivedDT","statusDate","sessionNumber","sequenceNumber","logicalTerminalAddress","applicationId","serviceId","bankOperationCode"]);
                        const renderVal=(key,val)=>{
                            if(key==="status") return <span className={statusCls(String(val))}>{String(val)}</span>;
                            if(key==="io") return <span className={"dir-badge "+dirClass(String(val))}>{formatDirection(String(val))}</span>;
                            if(typeof val==="object") return <span style={{fontFamily:"monospace",fontSize:12,wordBreak:"break-all"}}>{JSON.stringify(val)}</span>;
                            return <span style={monoKeys.has(key)?{fontFamily:"monospace",fontSize:13,wordBreak:"break-all"}:{wordBreak:"break-word"}}>{String(val)}</span>;
                        };
                        const pairs=[];for(let i=0;i<ordered.length;i+=2)pairs.push([ordered[i],ordered[i+1]||null]);
                        return (
                            <div style={{display:"flex",flexDirection:"column",gap:0}}>
                                {pairs.map((pair,pi)=>(
                                    <div key={pi} style={{display:"grid",gridTemplateColumns:"1fr 1fr",borderBottom:"1px solid var(--gray-6)"}}>
                                        {pair.map((item,ci)=>item?(
                                            <div key={item.key} style={{padding:"14px 20px",borderRight:ci===0?"1px solid var(--gray-6)":"none",background:"var(--white)"}}>
                                                <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.07em",color:"var(--gray-3)",textTransform:"uppercase",marginBottom:5}}>{item.label}</div>
                                                <div style={{fontSize:13,color:"var(--black)",lineHeight:1.5}}>{renderVal(item.key,item.val)}</div>
                                            </div>
                                        ):(
                                            <div key={"e"+pi+ci} style={{padding:"14px 20px",background:"var(--white)"}}/>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
                </div>}
            </div>
        </div>
    );
}



// ════════════════════════════════════════════════════════════════════════════════
// MAIN SEARCH COMPONENT
// ════════════════════════════════════════════════════════════════════════════════
function Search() {
    const { token } = useAuth();

    const authHeaders = useCallback(() => ({
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {})
    }), [token]);

    const pagesPerGroup = 5;
    const [recordsPerPage, setRecordsPerPage] = useState(20);
    const [currentPage,  setCurrentPage]  = useState(1);
    const [startPage,    setStartPage]    = useState(1);
    const [showResult,   setShowResult]   = useState(false);
    const [goToPage,     setGoToPage]     = useState("");
    const [searchState,  setSearchState]  = useState(initialSearchState);
    const [result,       setResult]       = useState([]);
    const [allMessages,  setAllMessages]  = useState([]);
    const [isFetching,   setIsFetching]   = useState(false);
    const [fetchError,   setFetchError]   = useState(null);
    const [opts,         setOpts]         = useState(emptyOpts);
    const [optsLoading,  setOptsLoading]  = useState(true);
    const [activeCol,    setActiveCol]    = useState(null);
    const [colFilters,   setColFilters]   = useState({});
    const [sortKey,      setSortKey]      = useState(null);
    const [sortDir,      setSortDir]      = useState(SORT_NONE);
    const [selectedRows, setSelectedRows] = useState(new Set());
    const [visibleCols,  setVisibleCols]  = useState(new Set(COLUMNS.map(c=>c.key)));
    const [colWidths,    setColWidths]    = useState({});
    const colResizingRef = useRef(null);
    const [showColManager,  setShowColManager]  = useState(false);
    const [panelCollapsed,  setPanelCollapsed]  = useState(false);
    const [savedSearches,   setSavedSearches]   = useState([]);
    const [showSavedPanel,  setShowSavedPanel]  = useState(false);
    const [isSearching,     setIsSearching]     = useState(false);
    const [highlightText,   setHighlightText]   = useState("");
    const [showExportMenu,  setShowExportMenu]  = useState(false);
    const [exportScope,     setExportScope]     = useState("all");
    const [toastMsg,        setToastMsg]        = useState(null);
    const [openModals,      setOpenModals]      = useState([]);
    const openModalsRef = useRef([]);   // always-current mirror — no stale closure
    const topZRef  = useRef(1000);
    const modalIdRef = useRef(0);
    const [serverTotal,       setServerTotal]      = useState(0);
    const [serverTotalPages,  setServerTotalPages] = useState(0);
    const [isExporting,       setIsExporting]      = useState(false);
    const [searchMode,      setSearchMode]      = useState("fixed");
    const [advancedFields,  setAdvancedFields]  = useState([]);
    const [showFieldPicker, setShowFieldPicker] = useState(false);
    const [fieldPickerQuery,setFieldPickerQuery]= useState("");
    const [dynamicFields,   setDynamicFields]   = useState([]);
    const [dynFieldsLoaded, setDynFieldsLoaded] = useState(false);

    // ── Raw Copies state ─────────────────────────────────────────────────────
    const [rcFilters,        setRcFilters]        = useState(initialRcFilters);
    const [rcOpts,           setRcOpts]           = useState({ messageTypeCodes:[], directions:[], statuses:[], protocols:[], inputTypes:[], sources:[] });
    const [rcOptsLoading,    setRcOptsLoading]    = useState(true);
    const [rcResults,        setRcResults]        = useState([]);
    const [rcTotal,          setRcTotal]          = useState(0);
    const [rcTotalPages,     setRcTotalPages]     = useState(0);
    const [rcPage,           setRcPage]           = useState(0);
    // ── PATCHED: full pagination state (matches Fixed/Advanced) ──────────────
    const rcPagesPerGroup = 5;
    const [rcRecordsPerPage, setRcRecordsPerPage] = useState(20);
    const [rcGoToPage,       setRcGoToPage]       = useState("");
    const [rcStartPage,      setRcStartPage]      = useState(1);
    // ─────────────────────────────────────────────────────────────────────────
    const [rcLoading,        setRcLoading]        = useState(false);
    const [rcError,          setRcError]          = useState(null);
    const [rcSearched,       setRcSearched]       = useState(false);
    const [rcPanelCollapsed, setRcPanelCollapsed] = useState(false);
    const [rcExpandedRow,    setRcExpandedRow]    = useState(null);
    const [rcCopiedId,       setRcCopiedId]       = useState(null);

    const bottomScrollRef = useRef(null);
    const tableWrapperRef = useRef(null);
    const colManagerRef   = useRef(null);
    const exportMenuRef   = useRef(null);
    const fieldPickerRef  = useRef(null);

    const set      = (key) => (e) => setSearchState(s=>({...s,[key]:e.target.value}));
    const setField = (key,val) => setSearchState(s=>({...s,[key]:val}));
    const showToast = (msg,type="success") => { setToastMsg({msg,type}); setTimeout(()=>setToastMsg(null),3000); };

    // Keep openModalsRef in sync — no stale closure in openModal
    openModalsRef.current = openModals;

    // ── Auto-add new dynamic columns ────────────────────────────────────────
    useEffect(()=>{
        if (!dynFieldsLoaded) return;
        const newDynCols = dynamicFields.filter(f=>f.showInTable && f.columnLabel);
        if (newDynCols.length > 0) {
            setVisibleCols(prev => {
                const next = new Set(prev);
                newDynCols.forEach(f => next.add(f.key));
                return next;
            });
        }
    }, [dynFieldsLoaded, dynamicFields]);

    // ── Load dynamic field config ────────────────────────────────────────────
    useEffect(()=>{
        if (!token) return;
        fetch(API_FIELD_CFG_URL, { headers: authHeaders() })
            .then(r=>{ if(!r.ok) throw new Error("field-config error"); return r.json(); })
            .then(data=>{
                const converted = data.map(f => ({
                    key: f.key, label: f.label, group: f.group, type: f.type,
                    optKey: null, _backendOpts: f.options || [],
                    placeholder: f.options?.length ? `All ${f.label}` : `Enter ${f.label}`,
                    stateKeys: [f.key], colKeys: f.showInTable ? [f.key] : [],
                    backendParam: f.backendParam, columnLabel: f.columnLabel, showInTable: f.showInTable,
                }));
                setDynamicFields(converted);
                setDynFieldsLoaded(true);
                const newKeys = converted.filter(f=>!(f.key in initialSearchState));
                if (newKeys.length > 0) {
                    const patch = {};
                    newKeys.forEach(f => { patch[f.key] = ""; });
                    setSearchState(s=>({...s,...patch}));
                }
            })
            .catch(()=>{ setDynFieldsLoaded(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    },[token]);

    // ── Load dropdown options ────────────────────────────────────────────────
    useEffect(()=>{
        if (!token) return;
        setOptsLoading(true);
        fetch(API_DROPDOWN_URL, { headers: authHeaders() })
            .then(r=>{ if(!r.ok) throw new Error("dropdown-options error"); return r.json(); })
            .then(data=>{
                if(data.allMtMxTypes) allMtMxTypeMap = buildAllMtMxTypeMap(data.allMtMxTypes);
                setOpts(prev=>({
                    ...prev, ...data,
                    formats:              data.formats               || ["MT","MX"],
                    types:                data.messageCodes          || data.types              || [],
                    mtTypes:              (data.messageCodes||[]).filter(c=>c.toUpperCase().startsWith("MT")).sort(),
                    mxTypes:              (data.messageCodes||[]).filter(c=>!c.toUpperCase().startsWith("MT")).sort(),
                    allMtMxTypes:         data.allMtMxTypes          || [],
                    messageCodes:         data.messageCodes          || [],
                    directions:           data.ioDirections          || data.directions         || [],
                    statuses:             data.statuses              || [],
                    actions:              data.actions               || [],
                    phases:               data.phases                || [],
                    reasons:              data.reasons               || [],
                    ownerUnits:           data.owners                || data.ownerUnits          || [],
                    backendChannels:      data.networkChannels       || data.backendChannels     || [],
                    networkChannels:      data.networkChannels       || [],
                    networks:             data.networkProtocols      || data.networks            || [],
                    networkPriorities:    data.networkPriorities     || [],
                    deliveryModes:        data.deliveryModes         || [],
                    services:             data.services              || [],
                    currencies:           data.currencies            || [],
                    sourceSystems:        data.sourceSystems         || [],
                    countries:            data.countries             || [],
                    workflows:            data.workflows             || [],
                    workflowModels:       data.workflowModels        || [],
                    originatorApplications:data.originatorApplications||[],
                    finCopies:            data.finCopies             || [],
                    finCopyServices:      data.finCopyServices       || [],
                    processingTypes:      data.processingTypes       || [],
                    processPriorities:    data.processPriorities     || [],
                    profileCodes:         data.profileCodes          || [],
                    amlStatuses:          data.amlStatuses           || [],
                    nackCodes:            data.nackCodes             || [],
                    messagePriorities:    data.messagePriorities     || [],
                    copyIndicators:       data.copyIndicators        || [],
                }));
                setOptsLoading(false);
            })
            .catch(()=>{ setOptsLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    },[token]);

    // ── Load Raw Copies dropdown options ─────────────────────────────────────
    useEffect(()=>{
        if (!token) return;
        fetch(`${API_RAW_COPIES_URL}/dropdown-options`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => { setRcOpts(d.data || d); setRcOptsLoading(false); })
            .catch(() => setRcOptsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    },[token]);

    // Derive opts from loaded messages when API opts are empty
    useEffect(()=>{
        if(optsLoading || opts.formats.length>0 || allMessages.length===0) return;
        const unique = (key) => [...new Set(allMessages.map(m=>m[key]).filter(Boolean))].sort();
        const typesFromMt      = [...new Set(allMessages.filter(m=>normalizeFormat(m.format)==="MT").map(m=>m.type).filter(t=>t&&!t.includes("/")))].sort();
        const typesFromMx      = [...new Set(allMessages.filter(m=>normalizeFormat(m.format)==="MX").map(m=>m.type).filter(t=>t&&!t.includes("/")))].sort();
        const typesFromAllMtMx = [...new Set(allMessages.filter(m=>normalizeFormat(m.format)==="ALL MT&MX").map(m=>m.type).filter(t=>t&&!t.includes("/")))].sort();
        const allMtMxPairs = Object.entries(allMtMxTypeMap).filter(([,sides])=>typesFromAllMtMx.some(t=>sides.includes(t))).map(([k])=>k);
        allMtMxTypeMap = buildAllMtMxTypeMap(allMtMxPairs);
        const allIndividual = [...new Set([...typesFromMt,...typesFromMx,...typesFromAllMtMx])].sort();
        const formats=[];
        if(typesFromMt.length)   formats.push("MT");
        if(typesFromMx.length)   formats.push("MX");
        if(allMtMxPairs.length)  formats.push("ALL MT&MX");
        setOpts({ formats, types:allIndividual, mtTypes:typesFromMt, mxTypes:typesFromMx, allMtMxTypes:allMtMxPairs, networks:unique("network"), sourceSystems:unique("sourceSystem"), currencies:unique("currency"), ownerUnits:unique("ownerUnit"), backendChannels:unique("backendChannel"), directions:unique("direction"), statuses:unique("status"), finCopies:unique("finCopy"), actions:unique("action"), phases:unique("phase"), messageCodes:allIndividual, countries:unique("country"), workflows:unique("workflow"), networkChannels:unique("backendChannel"), networkPriorities:[], senders:unique("sender"), receivers:unique("receiver") });
    },[allMessages, optsLoading, opts.formats.length]);

    const typeOptions = useMemo(()=>{
        if(searchState.format==="MT")        return opts.mtTypes      || [];
        if(searchState.format==="MX")        return opts.mxTypes      || [];
        if(searchState.format==="ALL MT&MX") return opts.allMtMxTypes || [];
        return opts.types || [];
    },[searchState.format, opts]);

    const activeFieldDefs = useMemo(()=>{
        if (dynFieldsLoaded && dynamicFields.length > 0) {
            const dynKeys = new Set(dynamicFields.map(f=>f.key));
            const staticOnly = FIELD_DEFINITIONS.filter(f=>!dynKeys.has(f.key));
            return [...dynamicFields, ...staticOnly];
        }
        return FIELD_DEFINITIONS;
    }, [dynFieldsLoaded, dynamicFields]);

    // Close dropdowns on outside click
    useEffect(()=>{
        const h=(e)=>{
            if(colManagerRef.current&&!colManagerRef.current.contains(e.target)) setShowColManager(false);
            if(exportMenuRef.current&&!exportMenuRef.current.contains(e.target))  setShowExportMenu(false);
            if(fieldPickerRef.current&&!fieldPickerRef.current.contains(e.target)) setShowFieldPicker(false);
        };
        document.addEventListener("mousedown",h);
        return ()=>document.removeEventListener("mousedown",h);
    },[]);

    useEffect(()=>{
        const onKey=(e)=>{ if(e.key==="Escape"){ setShowFieldPicker(false); } };
        document.addEventListener("keydown",onKey);
        return ()=>document.removeEventListener("keydown",onKey);
    });

    const syncScroll=(src)=>{
        const sl=src.currentTarget.scrollLeft;
        if(src.currentTarget!==bottomScrollRef.current&&bottomScrollRef.current) bottomScrollRef.current.scrollLeft=sl;
        if(src.currentTarget!==tableWrapperRef.current&&tableWrapperRef.current) tableWrapperRef.current.scrollLeft=sl;
    };

    // ── Mode switch ──────────────────────────────────────────────────────────
    const handleModeSwitch = (mode) => {
        if (mode === searchMode) return;
        setSearchMode(mode);
        if (mode !== "rawcopies") {
            setSearchState(initialSearchState);
            setResult([]); setShowResult(false);
            setCurrentPage(1); setStartPage(1);
            setColFilters({}); setActiveCol(null);
            setSortKey(null); setSortDir(SORT_NONE);
            setSelectedRows(new Set()); setHighlightText("");
            setServerTotal(0); setServerTotalPages(0);
            if (mode === "advanced") setAdvancedFields(["dateRange"]);
        }
        showToast(`Switched to ${mode === "fixed" ? "Fixed" : mode === "advanced" ? "Advanced" : "Raw Copies"} Search`, "info");
    };

    const addAdvancedField = (fieldKey) => {
        if (!advancedFields.includes(fieldKey)) setAdvancedFields(p=>[...p, fieldKey]);
        setShowFieldPicker(false);
        setFieldPickerQuery("");
    };

    const removeAdvancedField = (fieldKey) => {
        setAdvancedFields(p=>p.filter(k=>k!==fieldKey));
        const def = activeFieldDefs.find(f=>f.key===fieldKey) || FIELD_DEFINITIONS.find(f=>f.key===fieldKey);
        if (def) {
            const patch = {};
            (def.stateKeys||[fieldKey]).forEach(sk=>{ patch[sk]=""; });
            setSearchState(s=>({...s,...patch}));
        }
    };

    const advancedResultCols = useMemo(()=>{
        if (searchMode !== "advanced") return null;
        const colKeySet = new Set(ADV_BASE_COLS);
        advancedFields.forEach(fkey=>{
            const def = activeFieldDefs.find(f=>f.key===fkey) || FIELD_DEFINITIONS.find(f=>f.key===fkey);
            if (def) def.colKeys.forEach(ck=>colKeySet.add(ck));
        });
        const extraCols = [];
        advancedFields.forEach(fkey=>{
            const def = activeFieldDefs.find(f=>f.key===fkey);
            if (def && def.showInTable && def.columnLabel && !COLUMNS.find(c=>c.key===fkey)) {
                extraCols.push({ key: fkey, label: def.columnLabel, sortable: true });
                colKeySet.add(fkey);
            }
        });
        const staticFiltered = COLUMNS.filter(c=>colKeySet.has(c.key));
        return [...staticFiltered, ...extraCols.filter(c=>!staticFiltered.find(s=>s.key===c.key))];
    },[searchMode, advancedFields, activeFieldDefs]);

    const handleClear=()=>{
        setSearchState(initialSearchState); setResult([]); setShowResult(false);
        setCurrentPage(1); setStartPage(1); setColFilters({}); setActiveCol(null);
        setGoToPage(""); setSortKey(null); setSortDir(SORT_NONE);
        setSelectedRows(new Set()); setHighlightText(""); setExportScope("all");
        setServerTotal(0); setServerTotalPages(0);
        if (searchMode==="advanced") setAdvancedFields(["dateRange"]);
    };

    // ── Build URL params ─────────────────────────────────────────────────────
    const buildParams = useCallback((s, page, size) => {
        const params = new URLSearchParams();
        const d = (v) => v && v.replace(/\//g, "-");
        if(s.format)               params.set("messageType",           s.format);
        const msgCode = s.messageCode || s.type;
        if(msgCode)                params.set("messageCode",           msgCode);
        const dirVal = s.direction || s.io;
        if(dirVal)                 params.set("io",                    dirVal);
        if(s.status)               params.set("status",                s.status);
        if(s.messagePriority)      params.set("messagePriority",       s.messagePriority);
        if(s.copyIndicator)        params.set("copyIndicator",         s.copyIndicator);
        if(s.finCopy)              params.set("finCopyService",        s.finCopy);
        if(s.possibleDuplicate)    params.set("possibleDuplicate",     s.possibleDuplicate);
        if(s.sender)               params.set("sender",                s.sender);
        if(s.receiver)             params.set("receiver",              s.receiver);
        if(s.correspondent)        params.set("correspondent",         s.correspondent);
        if(s.reference)            params.set("reference",             s.reference);
        if(s.transactionReference) params.set("transactionReference",  s.transactionReference);
        if(s.transferReference)    params.set("transferReference",     s.transferReference);
        if(s.relatedReference)     params.set("relatedReference",      s.relatedReference);
        if(s.userReference)        params.set("mur",                   s.userReference);
        if(s.uetr)                 params.set("uetr",                  s.uetr);
        if(s.mxInputReference)     params.set("mxInputReference",      s.mxInputReference);
        if(s.mxOutputReference)    params.set("mxOutputReference",     s.mxOutputReference);
        if(s.networkReference)     params.set("networkReference",      s.networkReference);
        if(s.e2eMessageId)         params.set("e2eMessageId",          s.e2eMessageId);
        if(s.currency)             params.set("ccy",                   s.currency);
        if(s.amountFrom && !isNaN(parseFloat(s.amountFrom))) params.set("amountFrom", parseFloat(s.amountFrom));
        if(s.amountTo   && !isNaN(parseFloat(s.amountTo)))   params.set("amountTo",   parseFloat(s.amountTo));
        if(s.network)              params.set("networkProtocol",       s.network);
        const netChan = s.backendChannel || s.networkChannel;
        if(netChan)                params.set("networkChannel",        netChan);
        if(s.networkPriority)      params.set("networkPriority",       s.networkPriority);
        if(s.deliveryMode)         params.set("deliveryMode",          s.deliveryMode);
        if(s.service)              params.set("service",               s.service);
        if(s.country)              params.set("country",               s.country);
        if(s.originCountry)        params.set("originCountry",         s.originCountry);
        if(s.destinationCountry)   params.set("destinationCountry",    s.destinationCountry);
        if(s.ownerUnit)            params.set("owner",                 s.ownerUnit);
        if(s.workflow)             params.set("workflow",              s.workflow);
        if(s.workflowModel)        params.set("workflowModel",         s.workflowModel);
        if(s.originatorApplication)params.set("originatorApplication", s.originatorApplication);
        if(s.phase)                params.set("phase",                 s.phase);
        if(s.action)               params.set("action",                s.action);
        if(s.reason)               params.set("reason",                s.reason);
        if(s.processingType)       params.set("processingType",        s.processingType);
        if(s.processPriority)      params.set("processPriority",       s.processPriority);
        if(s.profileCode)          params.set("profileCode",           s.profileCode);
        if(s.environment)          params.set("environment",           s.environment);
        if(s.nack)                 params.set("nack",                  s.nack);
        if(s.amlStatus)            params.set("amlStatus",             s.amlStatus);
        if(s.amlDetails)           params.set("amlDetails",            s.amlDetails);
        if(s.seqFrom && !isNaN(parseInt(s.seqFrom,10))) params.set("seqFrom", parseInt(s.seqFrom,10));
        if(s.seqTo   && !isNaN(parseInt(s.seqTo,  10))) params.set("seqTo",   parseInt(s.seqTo,  10));
        if(s.startDate)            params.set("startDate",             d(s.startDate));
        if(s.endDate)              params.set("endDate",               d(s.endDate));
        if(s.valueDateFrom)        params.set("valueDateFrom",         d(s.valueDateFrom));
        if(s.valueDateTo)          params.set("valueDateTo",           d(s.valueDateTo));
        if(s.statusDateFrom)       params.set("statusDateFrom",        d(s.statusDateFrom));
        if(s.statusDateTo)         params.set("statusDateTo",          d(s.statusDateTo));
        if(s.receivedDateFrom)     params.set("receivedDateFrom",      d(s.receivedDateFrom));
        if(s.receivedDateTo)       params.set("receivedDateTo",        d(s.receivedDateTo));
        if(s.historyEntity)        params.set("historyEntity",         s.historyEntity);
        if(s.historyDescription)   params.set("historyDescription",    s.historyDescription);
        if(s.historyPhase)         params.set("historyPhase",          s.historyPhase);
        if(s.historyAction)        params.set("historyAction",         s.historyAction);
        if(s.historyUser)          params.set("historyUser",           s.historyUser);
        if(s.historyChannel)       params.set("historyChannel",        s.historyChannel);
        if(s.block4Value)          params.set("block4Value",           s.block4Value);
        if(s.freeSearchText)       params.set("freeSearchText",        s.freeSearchText);
        params.set("page", page);
        params.set("size", size);
        return params;
    }, []);

    // ── Execute SWIFT message search ──────────────────────────────────────────
    const handleSearch=(pageOverride)=>{
        if(searchMode==="advanced"&&advancedFields.length===1&&advancedFields[0]==="dateRange"){
            showToast("Add at least one more search field in Advanced mode","error"); return;
        }
        setIsSearching(true); setIsFetching(true); setFetchError(null);
        const page = (pageOverride !== undefined) ? pageOverride : 0;
        const params = buildParams(searchState, page, recordsPerPage);
        fetch(`${API_BASE_URL}?${params.toString()}`, { headers: authHeaders() })
            .then(r=>{ if(!r.ok) throw new Error(`Search failed (${r.status})`); return r.json(); })
            .then(data=>{
                const rows = data.content || data;
                setResult(rows); setAllMessages(rows);
                setServerTotal(data.totalElements || rows.length);
                setServerTotalPages(data.totalPages || 1);
                setCurrentPage((data.pageNumber||0)+1);
                setStartPage(Math.floor((data.pageNumber||0)/pagesPerGroup)*pagesPerGroup+1);
                setHighlightText(searchState.freeSearchText||"");
                setShowResult(true); setColFilters({}); setActiveCol(null); setGoToPage("");
                setSortKey(null); setSortDir(SORT_NONE);
                setSelectedRows(new Set()); setExportScope("all");
                setIsSearching(false); setIsFetching(false);
                const total = data.totalElements || rows.length;
                showToast(`Found ${total} message${total!==1?"s":""}`, "info");
                if(!panelCollapsed && total>0) setPanelCollapsed(true);
            })
            .catch(err=>{
                setFetchError(err.message); setIsSearching(false); setIsFetching(false);
                showToast(err.message, "error");
            });
    };

    const handleKeyDown=(e)=>{ if(e.key==="Enter") handleSearch(); };

    // ── Raw Copies search ────────────────────────────────────────────────────
    const setRcField = (key) => (e) => setRcFilters(f => ({ ...f, [key]: e.target.value }));

    const doRcSearch = useCallback((p = 0) => {
        if (!token) return;
        setRcLoading(true); setRcError(null);
        // PATCHED: use rcRecordsPerPage
        const params = new URLSearchParams({ page: p, size: rcRecordsPerPage });
        Object.entries(rcFilters).forEach(([k, v]) => { if (v !== "") params.set(k, v); });
        fetch(`${API_RAW_COPIES_URL}?${params}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`Error ${r.status}`); return r.json(); })
            .then(data => {
                const rows = data.content || data.rows || [];
                setRcResults(rows);
                setRcTotal(data.totalElements || rows.length);
                setRcTotalPages(data.totalPages || 1);
                setRcPage(p);
                // PATCHED: update rcStartPage
                setRcStartPage(Math.floor(p / rcPagesPerGroup) * rcPagesPerGroup + 1);
                setRcSearched(true);
                setRcLoading(false);
                if (!rcPanelCollapsed && rows.length > 0) setRcPanelCollapsed(true);
                showToast(`Found ${data.totalElements || rows.length} raw cop${(data.totalElements || rows.length) !== 1 ? "ies" : "y"}`, "info");
            })
            .catch(e => { setRcError(e.message); setRcLoading(false); showToast(e.message, "error"); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, authHeaders, rcFilters, rcPanelCollapsed, rcRecordsPerPage]);

    const handleRcReset = () => {
        setRcFilters(initialRcFilters);
        setRcResults([]); setRcTotal(0); setRcTotalPages(0); setRcPage(0);
        // PATCHED: reset new pagination state
        setRcStartPage(1); setRcGoToPage("");
        setRcSearched(false); setRcExpandedRow(null); setRcError(null); setRcPanelCollapsed(false);
    };

    const handleRcKey = (e) => { if (e.key === "Enter") doRcSearch(0); };

    const rcGrouped = useMemo(() => {
        const map = new Map();
        rcResults.forEach(row => {
            const ref = row.messageReference || "—";
            if (!map.has(ref)) map.set(ref, []);
            map.get(ref).push(row);
        });
        return [...map.entries()];
    }, [rcResults]);

    const rcDupCount = rcResults.filter(r => r.isDuplicate).length;
    const rcOkCount  = rcResults.filter(r => rcStatusCls(r.currentStatus).includes("ok")).length;

    const copyRaw = (id, text) => {
        navigator.clipboard.writeText(text || "").then(() => {
            setRcCopiedId(id);
            setTimeout(() => setRcCopiedId(null), 1800);
        });
    };

    // ── Reference helper ─────────────────────────────────────────────────────
    const getReference=(msg)=>
        msg.reference || msg.mur || msg.transactionReference || msg.transferReference ||
        msg.relatedReference || msg.userReference || msg.rfkReference || msg.messageReference ||
        (msg.uetr ? `UETR-${String(msg.uetr).slice(0,8).toUpperCase()}` : null) ||
        `ID-${String(msg.id||msg.sequenceNumber||"").slice(0,10)||"UNKNOWN"}`;

    const saveSearch=()=>{ const name=prompt("Name this search:"); if(!name)return; setSavedSearches(p=>[...p,{name,state:{...searchState},mode:searchMode,advFields:[...advancedFields],ts:Date.now()}]); showToast(`Search "${name}" saved`); };
    const loadSearch=(s)=>{ setSearchState(s.state); if(s.mode) setSearchMode(s.mode); if(s.advFields) setAdvancedFields(s.advFields); setShowSavedPanel(false); showToast(`Loaded "${s.name}"`); };
    const deleteSearch=(idx)=>setSavedSearches(p=>p.filter((_,i)=>i!==idx));

    const handleSort=(key)=>{
        if(sortKey!==key){ setSortKey(key); setSortDir(SORT_ASC); }
        else if(sortDir===SORT_NONE||sortDir===null){ setSortDir(SORT_ASC); }
        else if(sortDir===SORT_ASC){ setSortDir(SORT_DESC); }
        else { setSortKey(null); setSortDir(SORT_NONE); }
        setCurrentPage(1); setStartPage(1);
    };

    const handleColFilter=(key,value)=>{ setColFilters(p=>({...p,[key]:value})); setCurrentPage(1); setStartPage(1); };

    // Stable unique key — MongoDB _id priority, no Math.random()
    const getMsgId = (msg) => {
        const raw = msg.rawMessage || msg;
        const oid = raw._id?.$oid || raw._id || msg.id;
        if (oid) return String(oid);
        if (msg.transactionReference) return `txn-${msg.transactionReference}`;
        if (msg.reference)            return `ref-${msg.reference}`;
        if (msg.mur)                  return `mur-${msg.mur}`;
        return `seq-${msg.sequenceNumber}-${msg.creationDate || msg.date || ""}`;
    };

    const toggleRow=(id)=>setSelectedRows(p=>{ const n=new Set(p); n.has(id)?n.delete(id):n.add(id); return n; });
    const toggleCol=(key)=>setVisibleCols(p=>{ const n=new Set(p); if(n.has(key)&&n.size>3) n.delete(key); else if(n.has(key)&&n.size<=3) showToast("Minimum 3 columns required","error"); else n.add(key); return n; });

    const handleColResizeStart = useCallback((e, colKey, thEl) => {
        e.preventDefault(); e.stopPropagation();
        const startW = thEl.offsetWidth;
        colResizingRef.current = { key: colKey, startX: e.clientX, startW, thEl };
        document.body.style.userSelect = "none";
        document.body.style.cursor = "col-resize";
        const onMove = (ev) => {
            const r = colResizingRef.current;
            if (!r) return;
            const newW = Math.max(60, r.startW + (ev.clientX - r.startX));
            r.thEl.style.width    = newW + "px";
            r.thEl.style.minWidth = newW + "px";
        };
        const onUp = (ev) => {
            const r = colResizingRef.current;
            if (!r) return;
            const newW = Math.max(60, r.startW + (ev.clientX - r.startX));
            colResizingRef.current = null;
            document.body.style.userSelect = "";
            document.body.style.cursor = "";
            setColWidths(prev => ({ ...prev, [r.key]: newW }));
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup",   onUp);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup",   onUp);
    }, []);

    const resetColWidth = useCallback((colKey) => {
        setColWidths(prev => { const n = {...prev}; delete n[colKey]; return n; });
    }, []);

    const ALWAYS_VISIBLE_COLS = new Set(["sequenceNumber","format","type","date","time"]);

    const allColumns = useMemo(()=>{
        if (!dynFieldsLoaded || dynamicFields.length === 0) return COLUMNS;
        const staticKeys = new Set(COLUMNS.map(c=>c.key));
        const extraCols = dynamicFields
            .filter(f => f.showInTable && f.columnLabel && !staticKeys.has(f.key))
            .map(f => ({ key: f.key, label: f.columnLabel, sortable: true, isDynamic: true }));
        return [...COLUMNS, ...extraCols];
    }, [dynFieldsLoaded, dynamicFields]);

    const autoVisibleCols = useMemo(()=>{
        if (searchMode !== "fixed" || result.length === 0) return new Set(allColumns.map(c=>c.key));
        const hasValue = new Set();
        result.forEach(msg => {
            allColumns.forEach(col => {
                const v = msg[col.key];
                if (v !== null && v !== undefined && v !== "" && v !== false) hasValue.add(col.key);
            });
        });
        ALWAYS_VISIBLE_COLS.forEach(k => hasValue.add(k));
        return hasValue;
    }, [result, searchMode, allColumns]);

    const shownCols = searchMode==="advanced" && advancedResultCols
        ? advancedResultCols
        : allColumns.filter(c => visibleCols.has(c.key) && autoVisibleCols.has(c.key));

    const processed=useMemo(()=>{
        let data=result.filter(msg=>allColumns.every(col=>{ const fv=colFilters[col.key]; if(!fv)return true; if(col.key==="format")return getDisplayFormat(msg).toLowerCase().includes(fv.toLowerCase()); if(col.key==="type")return getDisplayType(msg).toLowerCase().includes(fv.toLowerCase()); return String(msg[col.key]??"").toLowerCase().includes(fv.toLowerCase()); }));
        if(sortKey&&sortDir!==SORT_NONE){
            data=[...data].sort((a,b)=>{
                const av=sortKey==="format"?getDisplayFormat(a):sortKey==="type"?getDisplayType(a):(a[sortKey]??"");
                const bv=sortKey==="format"?getDisplayFormat(b):sortKey==="type"?getDisplayType(b):(b[sortKey]??"");
                const cmp=typeof av==="number"?av-bv:String(av).localeCompare(String(bv));
                return sortDir===SORT_ASC?cmp:-cmp;
            });
        }
        return data;
    },[result,colFilters,sortKey,sortDir]);

    const indexOfLast=currentPage*recordsPerPage, indexOfFirst=indexOfLast-recordsPerPage;
    const currentRecords=processed;
    const totalPages=serverTotalPages || Math.ceil(processed.length/recordsPerPage);

    const handlePageClick=(page)=>{
        setCurrentPage(page);
        setSelectedRows(new Set());
        setStartPage(Math.floor((page-1)/pagesPerGroup)*pagesPerGroup+1);
        handleSearch(page-1);
    };

    // ── Export ───────────────────────────────────────────────────────────────
    const fetchAllRows = async () => {
        const params = buildParams(searchState, 0, serverTotal > 0 ? serverTotal : 10000);
        const res = await fetch(`${API_BASE_URL}?${params.toString()}`, { headers: authHeaders() });
        if (!res.ok) throw new Error(`Export fetch failed (${res.status})`);
        const data = await res.json();
        return data.content || data;
    };

    const getExportRows = (scope) => {
        if (scope === "selected") return processed.filter(m => selectedRows.has(getMsgId(m)));
        if (scope === "page")     return currentRecords;
        return null;
    };

    const runExport = async (scope, format) => {
        setShowExportMenu(false);
        let rows;
        if (scope === "all") {
            setIsExporting(true);
            showToast(`Fetching all ${serverTotal.toLocaleString()} records…`, "info");
            try { rows = await fetchAllRows(); }
            catch (e) { showToast("Export failed: " + e.message, "error"); setIsExporting(false); return; }
            setIsExporting(false);
        } else {
            rows = getExportRows(scope);
        }
        const getCellVal = (c, msg) =>
            c.key === "format" ? getDisplayFormat(msg) :
            c.key === "type"   ? getDisplayType(msg)   :
            (msg[c.key] != null ? String(msg[c.key]) : "");
        if (format === "csv") {
            const header = shownCols.map(c => c.label).join(",");
            const body   = rows.map(msg => shownCols.map(c => '"' + getCellVal(c, msg) + '"').join(",")).join("\n");
            const blob   = new Blob([header + "\n" + body], { type: "text/csv" });
            const url    = URL.createObjectURL(blob);
            const a      = document.createElement("a"); a.href = url; a.download = "swift_messages.csv"; a.click();
            URL.revokeObjectURL(url);
            showToast(`Exported ${rows.length.toLocaleString()} rows as CSV`);
        } else if (format === "json") {
            const blob = new Blob([JSON.stringify(rows.map(msg => ({ ...msg, format: getDisplayFormat(msg) })), null, 2)], { type: "application/json" });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement("a"); a.href = url; a.download = "swift_messages.json"; a.click();
            URL.revokeObjectURL(url);
            showToast(`Exported ${rows.length.toLocaleString()} rows as JSON`);
        } else if (format === "excel") {
            const doExport = (XLSX) => {
                const wsData = [shownCols.map(c => c.label), ...rows.map(msg => shownCols.map(c => msg[c.key] != null ? msg[c.key] : ""))];
                const ws = XLSX.utils.aoa_to_sheet(wsData); ws["!cols"] = shownCols.map(() => ({ wch: 20 }));
                const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "SWIFT Messages");
                XLSX.writeFile(wb, "swift_messages.xlsx");
                showToast(`Exported ${rows.length.toLocaleString()} rows as Excel`);
            };
            if (window.XLSX) { doExport(window.XLSX); }
            else {
                const sc = document.createElement("script");
                sc.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
                sc.onload = () => doExport(window.XLSX);
                sc.onerror = () => showToast("Failed to load Excel library", "error");
                document.head.appendChild(sc);
            }
        }
    };

    const summaryStats=showResult?[
        {label:"Total",   value:serverTotal,color:"var(--black)"},
        {label:"Accepted",value:processed.filter(m=>m.status==="ACCEPTED"||m.status==="DELIVERED").length,color:"var(--ok)"},
        {label:"Pending", value:processed.filter(m=>["PENDING","PROCESSING","REPAIR"].includes(m.status)).length,color:"var(--warn)"},
        {label:"Failed",  value:processed.filter(m=>["REJECTED","FAILED"].includes(m.status)).length,color:"var(--danger)"},
    ]:[];

    const renderCell=(col,msg)=>{
        const value=msg[col.key];
        if(col.key==="format")           { const d=getDisplayFormat(msg); return highlightText?highlight(d,highlightText):d; }
        if(col.key==="type")             { const d=getDisplayType(msg);   return highlightText?highlight(d,highlightText):d; }
        if(col.key==="status")           return <span className={statusCls(value)}>{value??"—"}</span>;
        if(col.key==="amount")           { if(value===undefined||value===null)return "—"; return Number(value).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}); }
        if(col.key==="direction")        return <span className={`dir-badge ${dirClass(value)}`}>{formatDirection(value)}</span>;
        if(col.key==="sequenceNumber")   return <span style={{fontFamily:"var(--mono)",fontWeight:600}}>{value??"—"}</span>;
        if(col.key==="possibleDuplicate"||col.key==="crossBorder") {
            if(value===true)  return <span style={{color:"var(--danger,#e24b4a)",fontWeight:600,fontSize:12}}>YES</span>;
            if(value===false) return <span style={{color:"var(--ok,#22c55e)",fontWeight:500,fontSize:12}}>NO</span>;
            return "—";
        }
        if(col.key==="amlStatus") {
            if(!value) return "—";
            const color = value==="CLEAR"||value==="CLEAN" ? "var(--ok,#22c55e)" : value==="FLAGGED"||value==="HIGH" ? "var(--danger,#e24b4a)" : "var(--warn,#f97316)";
            return <span style={{color,fontWeight:600,fontSize:12}}>{value}</span>;
        }
        if(col.key==="networkStatus") {
            if(!value) return "—";
            const color = value==="DELIVERED" ? "var(--ok,#22c55e)" : value==="FAILED" ? "var(--danger,#e24b4a)" : "var(--warn,#f97316)";
            return <span style={{color,fontWeight:600,fontSize:12}}>{value}</span>;
        }
        if(value===null||value===undefined) return "—";
        return highlightText?highlight(value,highlightText):String(value);
    };

    const sortIcon=(key)=>{ if(sortKey!==key)return <span className="sort-icon sort-idle">⇅</span>; return <span className="sort-icon sort-active">{sortDir===SORT_ASC?"↑":"↓"}</span>; };
    const activeFilterCount=Object.values(searchState).filter(v=>v!=="").length;
    const extraWidth=180+(shownCols.length>7?(shownCols.length-7)*130:0);
    const scopeTabs=[{key:"all",label:"All",count:serverTotal},{key:"page",label:"This Page",count:currentRecords.length},{key:"selected",label:"Selected",count:selectedRows.size}];

    // ── Advanced field renderer ───────────────────────────────────────────────
    const renderAdvancedField = (fieldKey) => {
        const def = activeFieldDefs.find(f=>f.key===fieldKey) || FIELD_DEFINITIONS.find(f=>f.key===fieldKey);
        if (!def) return null;
        const fieldContent = () => {
            switch(def.type) {
                case "select": {
                    const selectOpts = def.options || def._backendOpts || (def.optKey ? opts[def.optKey] || [] : []);
                    const isStatic   = !!(def.options || def._backendOpts);
                    return <DynSelect value={searchState[def.stateKeys[0]] || ""} onChange={set(def.stateKeys[0])} placeholder={def.placeholder} options={selectOpts} loading={isStatic ? false : optsLoading}/>;
                }
                case "select-type":
                    return <DynSelect value={searchState.type} onChange={set("type")} placeholder="All Types" options={typeOptions} loading={optsLoading}/>;
                case "date-range":
                    return (
                        <div className="adv-date-range-wrap">
                            <DateTimePicker label="From" dateValue={searchState.startDate} timeValue={searchState.startTime}
                                onDateChange={v=>{ setField("startDate", v); if(v){ const autoEnd=addOneMonth(v); if(!searchState.endDate||searchState.endDate>autoEnd) setField("endDate",autoEnd); } }}
                                onTimeChange={v=>setField("startTime",v)} onKeyDown={handleKeyDown}/>
                            <span className="adv-date-sep">→</span>
                            <DateTimePicker label="To" dateValue={searchState.endDate} timeValue={searchState.endTime}
                                onDateChange={v=>{ const clamped=clampToOneMonth(searchState.startDate,v); setField("endDate",clamped); if(clamped!==v) showToast("Max range is 1 month","error"); }}
                                onTimeChange={v=>setField("endTime",v)} onKeyDown={handleKeyDown}/>
                        </div>
                    );
                case "date-range2": {
                    const fromKey=def.stateKeys[0], toKey=def.stateKeys[1];
                    return (
                        <div className="adv-date-range-wrap">
                            <DateTimePicker label="From" dateValue={searchState[fromKey]} timeValue="" onDateChange={v=>setField(fromKey,v)} onTimeChange={()=>{}} onKeyDown={handleKeyDown}/>
                            <span className="adv-date-sep">→</span>
                            <DateTimePicker label="To" dateValue={searchState[toKey]} timeValue="" onDateChange={v=>setField(toKey,v)} onTimeChange={()=>{}} onKeyDown={handleKeyDown}/>
                        </div>
                    );
                }
                case "amount-range":
                    return <div className="adv-range-wrap"><input type="number" placeholder="Min Amount" value={searchState.amountFrom} onChange={set("amountFrom")} onKeyDown={handleKeyDown}/><span className="adv-range-sep">—</span><input type="number" placeholder="Max Amount" value={searchState.amountTo} onChange={set("amountTo")} onKeyDown={handleKeyDown}/></div>;
                case "seq-range":
                    return <div className="adv-range-wrap"><input type="number" placeholder="e.g. 1" value={searchState.seqFrom} onChange={set("seqFrom")} onKeyDown={handleKeyDown}/><span className="adv-range-sep">—</span><input type="number" placeholder="e.g. 9999" value={searchState.seqTo} onChange={set("seqTo")} onKeyDown={handleKeyDown}/></div>;
                case "text-wide":
                    return <input className="input-wide" placeholder={def.placeholder} value={searchState[def.stateKeys[0]]} onChange={set(def.stateKeys[0])} onKeyDown={handleKeyDown}/>;
                default:
                    return <input placeholder={def.placeholder} value={searchState[def.stateKeys[0]]} onChange={set(def.stateKeys[0])} onKeyDown={handleKeyDown}/>;
            }
        };
        return (
            <div key={fieldKey} className="adv-field-card">
                <div className="adv-field-header">
                    <span className="adv-field-label">{def.label}</span>
                    {fieldKey !== "dateRange" && (
                        <button className="adv-field-remove" onClick={()=>removeAdvancedField(fieldKey)} title="Remove field">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    )}
                </div>
                <div className="adv-field-input">{fieldContent()}</div>
            </div>
        );
    };

    const filteredFieldDefs = activeFieldDefs.filter(f=>
        f.key !== "dateRange" &&
        !advancedFields.includes(f.key) &&
        (fieldPickerQuery==="" || f.label.toLowerCase().includes(fieldPickerQuery.toLowerCase()) || f.group.toLowerCase().includes(fieldPickerQuery.toLowerCase()))
    );

    const allGroups = useMemo(()=>{
        const groups = new Set(FIELD_GROUPS);
        activeFieldDefs.forEach(f=>{ if(f.group) groups.add(f.group); });
        return [...groups];
    }, [activeFieldDefs]);

    const groupedFields = allGroups.reduce((acc,g)=>{
        const items = filteredFieldDefs.filter(f=>f.group===g);
        if (items.length) acc[g]=items;
        return acc;
    },{});

    // ── Multi-window modal system ────────────────────────────────────────────
    useEffect(() => {
        window.dispatchEvent(new CustomEvent("swift:modalsOpen", { detail: { open: openModals.length > 0 } }));
    }, [openModals.length]);

    const bringToFront = useCallback((id, z) => {
        if (z) topZRef.current = Math.max(topZRef.current, z);
        else   topZRef.current += 1;
        const finalZ = z || topZRef.current;
        setOpenModals(ms => ms.map(m => m.id === id ? { ...m, zIndex: finalZ } : m));
    }, []);

    // Tracks open msgKeys synchronously — prevents rapid double-clicks slipping through
    // before React commits the state update
    const openedKeysRef = useRef(new Set());

    const openModal = (msg, e, absIdx) => {
        e.stopPropagation();

        // Build a stable, unique key for this message
        const msgKey = String(
            msg.id ||
            msg.transactionReference ||
            msg.reference ||
            msg.mur || msg.userReference ||
            `${msg.sequenceNumber}-${msg.date||""}-${msg.sender||""}-${msg.receiver||""}`
        );

        // Check synchronously — openedKeysRef is updated immediately
        if (openedKeysRef.current.has(msgKey)) {
            // Already open — bring to front + flash
            setOpenModals(ms => {
                const existing = ms.find(m => m.msgKey === msgKey);
                if (!existing) return ms;
                topZRef.current += 1;
                return ms.map(m =>
                    m.id === existing.id
                        ? { ...m, zIndex: topZRef.current, _flash: (m._flash || 0) + 1 }
                        : m
                );
            });
            return;
        }

        // Mark as open immediately (sync) before state update
        openedKeysRef.current.add(msgKey);

        const id = ++modalIdRef.current;
        const count = openedKeysRef.current.size - 1; // -1 because we just added
        const vw = window.innerWidth, vh = window.innerHeight;
        const w = Math.min(880, vw - 80), h = Math.min(680, vh - 80);
        const off = (count % 8) * 30;
        const x = Math.max(20, Math.min(vw - w - 20, (vw - w) / 2 + off));
        const y = Math.max(20, Math.min(vh - h - 20, (vh - h) / 2 + off));
        topZRef.current += 1;
        setOpenModals(ms => [...ms, { id, msg, msgKey, tab: "header", pos: { x, y }, size: { w, h }, zIndex: topZRef.current, index: absIdx }]);
    };

    const closeModal = (id) => {
        setOpenModals(ms => {
            const modal = ms.find(m => m.id === id);
            if (modal) openedKeysRef.current.delete(modal.msgKey);
            return ms.filter(m => m.id !== id);
        });
    };
    const closeAllModals = () => {
        openedKeysRef.current.clear();
        setOpenModals([]);
    };
    const patchModal = useCallback((id, patch) => setOpenModals(ms => ms.map(m => m.id === id ? { ...m, ...patch } : m)), []);
    const goModalPrev = useCallback((id) => setOpenModals(ms => ms.map(m => { if(m.id!==id||m.index<=0)return m; return {...m,msg:processed[m.index-1],index:m.index-1,tab:"header"}; })), [processed]);
    const goModalNext = useCallback((id) => setOpenModals(ms => ms.map(m => { if(m.id!==id||m.index>=processed.length-1)return m; return {...m,msg:processed[m.index+1],index:m.index+1,tab:"header"}; })), [processed]);

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="container">
            {toastMsg&&<div className={`toast toast-${toastMsg.type}`}><span>{toastMsg.msg}</span></div>}
            {isFetching&&<div style={{padding:"10px 16px",background:"var(--accent-light)",borderRadius:6,marginBottom:8,fontSize:13,color:"var(--accent)",display:"flex",alignItems:"center",gap:8}}><span className="spinner" style={{borderTopColor:"var(--accent)"}}/>Loading messages from backend...</div>}
            {fetchError &&<div style={{padding:"10px 16px",background:"var(--danger-light)",borderRadius:6,marginBottom:8,fontSize:13,color:"var(--danger)",border:"1px solid var(--danger-border)"}}>&#x26A0; Backend error: {fetchError}. Make sure Spring Boot is running on http://localhost:8080</div>}

            {/* ── Header bar ── */}
            <div className="app-header">
                <div className="app-header-actions">
                    <div className="search-mode-toggle">
                        <button className={`mode-btn${searchMode==="fixed"?" mode-btn-active":""}`} onClick={()=>handleModeSwitch("fixed")}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                            Fixed
                        </button>
                        <button className={`mode-btn${searchMode==="advanced"?" mode-btn-active":""}`} onClick={()=>handleModeSwitch("advanced")}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                            Advanced
                        </button>
                        <button className={`mode-btn${searchMode==="rawcopies"?" mode-btn-active":""}`} onClick={()=>handleModeSwitch("rawcopies")}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
                            Raw Copies
                        </button>
                    </div>
                    {searchMode !== "rawcopies" && savedSearches.length > 0 && (
                        <button className="hdr-btn" onClick={()=>setShowSavedPanel(!showSavedPanel)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
                            Saved ({savedSearches.length})
                        </button>
                    )}
                    {searchMode !== "rawcopies" && (
                        <button className="hdr-btn" onClick={saveSearch}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                            Save Search
                        </button>
                    )}
                </div>
            </div>

            {showSavedPanel&&<div className="saved-panel"><div className="saved-panel-header"><span>Saved Searches</span><button className="icon-btn" onClick={()=>setShowSavedPanel(false)}>&#x2715;</button></div>{savedSearches.map((s,i)=>(<div key={i} className="saved-item"><span className="saved-name">{s.name}</span><span className="saved-ts">{new Date(s.ts).toLocaleDateString()}</span><button className="pg-btn" onClick={()=>loadSearch(s)}>Load</button><button className="icon-btn danger-btn" onClick={()=>deleteSearch(i)}>&#x2715;</button></div>))}</div>}

            {/* ══════════ RAW COPIES MODE ══════════ */}
            {searchMode === "rawcopies" && (<>
                <div className="rc-panel">
                    <div className="rc-panel-title" onClick={() => setRcPanelCollapsed(p => !p)}>
                        <div className="rc-panel-title-left">
                            <span>Raw Copies Search</span>
                            <span className="rc-mode-chip">
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                amp_raw_copies
                            </span>
                            {rcTotal > 0 && <span className="filter-badge">{rcTotal.toLocaleString()} found</span>}
                        </div>
                        <span className="collapse-icon">{rcPanelCollapsed ? "▼ Expand" : "▲ Collapse"}</span>
                    </div>
                    {!rcPanelCollapsed && (
                        <div className="rc-grid">
                            <div className="rc-field"><label>Message Reference</label><input placeholder="e.g. KCRJ48066072DGTF" value={rcFilters.messageReference} onChange={setRcField("messageReference")} onKeyDown={handleRcKey}/></div>
                            <div className="rc-field"><label>Message ID</label><input placeholder="Internal message ID" value={rcFilters.messageId} onChange={setRcField("messageId")} onKeyDown={handleRcKey}/></div>
                            <div className="rc-field"><label>Sender BIC</label><input placeholder="e.g. ABNANL2AXXX" value={rcFilters.sender} onChange={setRcField("sender")} onKeyDown={handleRcKey}/></div>
                            <div className="rc-field"><label>Receiver BIC</label><input placeholder="e.g. RBOSGB2LXXX" value={rcFilters.receiver} onChange={setRcField("receiver")} onKeyDown={handleRcKey}/></div>
                            <div className="rc-field"><label>Message Type</label>
                                <select value={rcFilters.messageTypeCode} onChange={setRcField("messageTypeCode")} onKeyDown={handleRcKey} disabled={rcOptsLoading}>
                                    <option value="">{rcOptsLoading ? "Loading…" : "All Types"}</option>
                                    {(rcOpts.messageTypeCodes || []).map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                            </div>
                            <div className="rc-field"><label>Direction</label>
                                <select value={rcFilters.direction} onChange={setRcField("direction")} onKeyDown={handleRcKey} disabled={rcOptsLoading}>
                                    <option value="">{rcOptsLoading ? "Loading…" : "All Directions"}</option>
                                    {(rcOpts.directions || []).map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                            </div>
                            <div className="rc-field"><label>Status</label>
                                <select value={rcFilters.currentStatus} onChange={setRcField("currentStatus")} onKeyDown={handleRcKey} disabled={rcOptsLoading}>
                                    <option value="">{rcOptsLoading ? "Loading…" : "All Statuses"}</option>
                                    {(rcOpts.statuses || []).map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                            </div>
                            <div className="rc-field"><label>Protocol</label>
                                <select value={rcFilters.protocol} onChange={setRcField("protocol")} onKeyDown={handleRcKey} disabled={rcOptsLoading}>
                                    <option value="">{rcOptsLoading ? "Loading…" : "All Protocols"}</option>
                                    {(rcOpts.protocols || []).map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                            </div>
                            <div className="rc-field"><label>Input Type</label>
                                <select value={rcFilters.inputType} onChange={setRcField("inputType")} onKeyDown={handleRcKey} disabled={rcOptsLoading}>
                                    <option value="">{rcOptsLoading ? "Loading…" : "All Types"}</option>
                                    {(rcOpts.inputTypes || []).map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                            </div>
                            <div className="rc-field"><label>Source</label>
                                <select value={rcFilters.source} onChange={setRcField("source")} onKeyDown={handleRcKey} disabled={rcOptsLoading}>
                                    <option value="">{rcOptsLoading ? "Loading…" : "All Sources"}</option>
                                    {(rcOpts.sources || []).map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                            </div>
                            <div className="rc-field"><label>Received From</label><input type="date" value={rcFilters.startDate} onChange={setRcField("startDate")} onKeyDown={handleRcKey}/></div>
                            <div className="rc-field"><label>Received To</label><input type="date" value={rcFilters.endDate} onChange={setRcField("endDate")} onKeyDown={handleRcKey}/></div>
                            <div className="rc-field"><label>Duplicate</label>
                                <select value={rcFilters.isDuplicate} onChange={setRcField("isDuplicate")} onKeyDown={handleRcKey}>
                                    <option value="">All</option>
                                    <option value="true">Duplicates only</option>
                                    <option value="false">Non-duplicates only</option>
                                </select>
                            </div>
                            <div className="rc-field rc-field-wide"><label>Free Search (across reference, sender, receiver, raw content)</label>
                                <input placeholder="Search across all fields…" value={rcFilters.freeText} onChange={setRcField("freeText")} onKeyDown={handleRcKey}/>
                            </div>
                        </div>
                    )}
                </div>

                <div className="action-bar">
                    <div className="action-left">
                        <button className={`search-btn${rcLoading ? " btn-loading" : ""}`} onClick={() => doRcSearch(0)} disabled={rcLoading}>
                            {rcLoading ? <><span className="spinner"/>Searching…</> : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/></svg>Search Raw Copies</>}
                        </button>
                        <button className="clear-btn" onClick={handleRcReset}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>Reset
                        </button>
                    </div>
                    <div className="action-hint">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                        Click a row to expand raw XML &#xB7; Grouped by Message Reference
                    </div>
                </div>

                {rcError && <div style={{padding:"10px 16px",background:"var(--danger-light)",borderRadius:6,marginBottom:8,fontSize:13,color:"var(--danger)",border:"1px solid var(--danger-border)"}}>&#x26A0; {rcError}</div>}

                {rcSearched && (<>
                    {rcResults.length > 0 && (
                        <div className="rc-stats-bar">
                            <div className="rc-stat"><span className="rc-stat-value">{rcTotal.toLocaleString()}</span><span className="rc-stat-label">Total Raw Copies</span></div>
                            <div className="rc-stat"><span className="rc-stat-value">{rcGrouped.length}</span><span className="rc-stat-label">Unique References</span></div>
                            <div className="rc-stat rc-stat-dup"><span className="rc-stat-value">{rcDupCount}</span><span className="rc-stat-label">Duplicates</span></div>
                            <div className="rc-stat rc-stat-ok"><span className="rc-stat-value">{rcOkCount}</span><span className="rc-stat-label">Distributed OK</span></div>
                        </div>
                    )}

                    {rcResults.length === 0 ? (
                        <div className="rc-empty">
                            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--gray-4)" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                            <p>No raw copies found</p><span>Try adjusting your search filters</span>
                        </div>
                    ) : (
                        <div className="rc-table-wrap">
                            <table className="rc-table">
                                <thead>
                                    <tr>
                                        <th style={{width:36}}/><th style={{width:40}}>#</th>
                                        <th>Message ID</th><th>Type</th><th>Direction</th>
                                        <th>Status</th><th>Sender</th><th>Receiver</th>
                                        <th>Protocol</th><th>Duplicate</th><th>Received At</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rcGrouped.map(([ref, rows]) => (
                                        <React.Fragment key={ref}>
                                            <tr className="rc-group-header">
                                                <td colSpan={11}>
                                                    <div className="rc-group-ref">
                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                                        <span className="rc-group-ref-text">{ref}</span>
                                                        <span className="rc-group-badge">
                                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                                                            {rows.length} cop{rows.length === 1 ? "y" : "ies"}
                                                        </span>
                                                        {rows.some(r => r.isDuplicate) && (
                                                            <span style={{fontSize:10,fontWeight:700,color:"#dc2626",background:"#fee2e2",padding:"2px 7px",borderRadius:20}}>HAS DUPLICATES</span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                            {rows.map((row, ri) => (
                                                <React.Fragment key={row.id || ri}>
                                                    <tr onClick={() => setRcExpandedRow(p => p === row.id ? null : row.id)}
                                                        style={{background: ri % 2 === 0 ? "var(--white)" : "var(--gray-7)", cursor:"pointer"}}>
                                                        <td>
                                                            <button className={`rc-expand-btn${rcExpandedRow === row.id ? " open" : ""}`}
                                                                onClick={e => { e.stopPropagation(); setRcExpandedRow(p => p === row.id ? null : row.id); }}
                                                                title="View raw content">
                                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                                                            </button>
                                                        </td>
                                                        <td style={{color:"var(--gray-3)",fontWeight:600,fontSize:12}}>{ri + 1}</td>
                                                        <td className="rc-mono" style={{fontSize:11}}>{row.messageId ? row.messageId.slice(0,20) + (row.messageId.length > 20 ? "…" : "") : "—"}</td>
                                                        <td><span style={{fontFamily:"monospace",fontWeight:700,fontSize:12}}>{row.messageTypeCode || "—"}</span></td>
                                                        <td><span className={rcDirCls(row.direction)}>{row.direction || "—"}</span></td>
                                                        <td><span className={rcStatusCls(row.currentStatus)}>{row.currentStatus || "—"}</span></td>
                                                        <td className="rc-mono">{row.senderAddress || "—"}</td>
                                                        <td className="rc-mono">{row.receiverAddress || "—"}</td>
                                                        <td style={{fontSize:12}}>{row.protocol || "—"}</td>
                                                        <td>
                                                            {row.isDuplicate === true  && <span className="rc-dup-yes">&#x25CF; DUP</span>}
                                                            {row.isDuplicate === false && <span className="rc-dup-no">&#x25CF; NO</span>}
                                                            {row.isDuplicate == null   && <span style={{color:"var(--gray-4)"}}>—</span>}
                                                        </td>
                                                        <td style={{fontSize:12,whiteSpace:"nowrap"}}>{fmtDate(row.receivedAt || row.ampDateReceived)}</td>
                                                    </tr>
                                                    {rcExpandedRow === row.id && (
                                                        <tr className="rc-raw-row">
                                                            <td colSpan={11}>
                                                                <div className="rc-raw-inner">
                                                                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                                                                        <div>
                                                                            <div className="rc-raw-label">Raw Input — {row.inputType || "UNKNOWN"} &#xB7; {row.source || "—"}</div>
                                                                            <div style={{fontSize:10,color:"var(--rc-raw-meta)",marginTop:2}}>
                                                                                ID: <span style={{fontFamily:"monospace"}}>{row.id}</span>
                                                                                {row.ampDateReceived && <> &#xB7; AMP received: {fmtDate(row.ampDateReceived)}</>}
                                                                            </div>
                                                                        </div>
                                                                        {row.rawInput && (
                                                                            <button className={`rc-copy-btn${rcCopiedId === row.id ? " copied" : ""}`}
                                                                                onClick={e => { e.stopPropagation(); copyRaw(row.id, row.rawInput); }}>
                                                                                {rcCopiedId === row.id ? "&#x2713; Copied" : "Copy XML"}
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                    {row.rawInput
                                                                        ? <pre className="rc-raw-xml">{row.rawInput}</pre>
                                                                        : <div style={{color:"var(--rc-raw-meta)",fontStyle:"italic",fontSize:13}}>No raw content available</div>
                                                                    }
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            ))}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* ── PATCHED: Full pagination matching Fixed/Advanced UX ── */}
                    {rcTotalPages >= 1 && (
                        <div className="pagination-bar">
                            <div className="pagination-left">
                                <span className="record-range">
                                    Showing <strong>{rcPage * rcRecordsPerPage + 1}&ndash;{Math.min((rcPage + 1) * rcRecordsPerPage, rcTotal)}</strong> of <strong>{rcTotal.toLocaleString()}</strong> records
                                </span>
                            </div>
                            <div className="pagination-center">
                                <button className="pg-btn pg-edge"
                                    onClick={() => { setRcStartPage(1); doRcSearch(0); }}
                                    disabled={rcPage === 0}>&#xAB;&#xAB;</button>
                                <button className="pg-btn"
                                    onClick={() => { const p = Math.max(0, rcPage - 1); setRcStartPage(Math.floor(p / rcPagesPerGroup) * rcPagesPerGroup + 1); doRcSearch(p); }}
                                    disabled={rcPage === 0}>&#x2039; Prev</button>
                                {rcStartPage > 1 && <span className="pg-ellipsis">…</span>}
                                {[...Array(rcPagesPerGroup)].map((_, i) => {
                                    const p = rcStartPage - 1 + i;
                                    if (p >= rcTotalPages) return null;
                                    return (
                                        <button key={p}
                                            className={`pg-btn pg-num${rcPage === p ? " pg-active" : ""}`}
                                            onClick={() => { setRcStartPage(Math.floor(p / rcPagesPerGroup) * rcPagesPerGroup + 1); doRcSearch(p); }}>
                                            {p + 1}
                                        </button>
                                    );
                                })}
                                {rcStartPage + rcPagesPerGroup - 1 < rcTotalPages && <span className="pg-ellipsis">…</span>}
                                <button className="pg-btn"
                                    onClick={() => { const p = Math.min(rcTotalPages - 1, rcPage + 1); setRcStartPage(Math.floor(p / rcPagesPerGroup) * rcPagesPerGroup + 1); doRcSearch(p); }}
                                    disabled={rcPage >= rcTotalPages - 1}>Next &#x203A;</button>
                                <button className="pg-btn pg-edge"
                                    onClick={() => { const p = rcTotalPages - 1; setRcStartPage(Math.floor(p / rcPagesPerGroup) * rcPagesPerGroup + 1); doRcSearch(p); }}
                                    disabled={rcPage >= rcTotalPages - 1}>&#xBB;&#xBB;</button>
                            </div>
                            <div className="pagination-right">
                                <label className="pg-label">Go to</label>
                                <input className="pg-goto" type="number" min="1" max={rcTotalPages}
                                    value={rcGoToPage} placeholder="pg"
                                    onChange={e => setRcGoToPage(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === "Enter") {
                                            const p = parseInt(rcGoToPage) - 1;
                                            if (p >= 0 && p < rcTotalPages) {
                                                setRcStartPage(Math.floor(p / rcPagesPerGroup) * rcPagesPerGroup + 1);
                                                doRcSearch(p);
                                            }
                                            setRcGoToPage("");
                                        }
                                    }}
                                />
                                <span className="pg-of-total">of {rcTotalPages}</span>
                                <span className="pg-divider"/>
                                <label className="pg-label">Rows</label>
                                <select className="pg-rows-select" value={rcRecordsPerPage}
                                    onChange={e => {
                                        setRcRecordsPerPage(Number(e.target.value));
                                        setRcPage(0); setRcStartPage(1);
                                        doRcSearch(0);
                                    }}>
                                    <option value={10}>10</option>
                                    <option value={20}>20</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                </select>
                            </div>
                        </div>
                    )}
                </>)}
            </>)}

            {/* ══════════ FIXED SEARCH PANEL ══════════ */}
            {searchMode==="fixed"&&(
                <div className={`search-panel${panelCollapsed?" panel-collapsed":""}`}>
                    <div className="panel-section-title" onClick={()=>setPanelCollapsed(p=>!p)} style={{cursor:"pointer"}}>
                        <span>Search Criteria {activeFilterCount>0&&<span className="filter-badge">{activeFilterCount} active</span>}</span>
                        <span className="collapse-icon">{panelCollapsed?"▼ Expand":"▲ Collapse"}</span>
                    </div>
                    {!panelCollapsed&&(<>
                        <div className="row">
                            <div className="field-group"><label>Message Format</label><DynSelect value={searchState.format} onChange={e=>setSearchState(s=>({...s,format:e.target.value,type:"",messageCode:""}))} placeholder="All Formats" options={opts.formats} loading={optsLoading}/></div>
                            <div className="field-group"><label>Message Type</label><select value={searchState.type} onChange={set("type")} onKeyDown={handleKeyDown}><option value="">All Types</option>{typeOptions.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                            <DateTimePicker label="Starting Date / Time" dateValue={searchState.startDate} timeValue={searchState.startTime} onDateChange={v=>setField("startDate",v)} onTimeChange={v=>setField("startTime",v)} onKeyDown={handleKeyDown}/>
                            <DateTimePicker label="Ending Date / Time"   dateValue={searchState.endDate}   timeValue={searchState.endTime}   onDateChange={v=>setField("endDate",v)}   onTimeChange={v=>setField("endTime",v)}   onKeyDown={handleKeyDown}/>
                            <div className="field-group"><label>User Reference (MUR)</label><input placeholder="MUR" value={searchState.userReference} onChange={set("userReference")} onKeyDown={handleKeyDown}/></div>
                        </div>
                        <div className="row">
                            <div className="field-group"><label>Source System</label><DynSelect value={searchState.sourceSystem} onChange={set("sourceSystem")} placeholder="All Systems" options={opts.sourceSystems} loading={optsLoading}/></div>
                            <div className="field-group"><label>RFK Reference / UMID</label><input placeholder="Enter RFK Reference" value={searchState.rfkReference} onChange={set("rfkReference")} onKeyDown={handleKeyDown}/></div>
                            <div className="field-group"><label>Message Direction</label><DynSelect value={searchState.direction} onChange={set("direction")} placeholder="All Directions" options={opts.directions.length?opts.directions:opts.ioDirections} loading={optsLoading}/></div>
                            <div className="field-group"><label>Status</label><DynSelect value={searchState.status} onChange={set("status")} placeholder="All Status" options={opts.statuses} loading={optsLoading}/></div>
                            <div className="field-group"><label>FIN-COPY</label><DynSelect value={searchState.finCopy} onChange={set("finCopy")} placeholder="All" options={opts.finCopies} loading={optsLoading}/></div>
                            <div className="field-group"><label>Network</label><DynSelect value={searchState.network} onChange={set("network")} placeholder="All Networks" options={opts.networks.length?opts.networks:opts.networkProtocols||[]} loading={optsLoading}/></div>
                        </div>
                        <div className="row">
                            <div className="field-group"><label>Sender BIC</label><input placeholder="Enter Sender BIC" value={searchState.sender} onChange={set("sender")} onKeyDown={handleKeyDown}/></div>
                            <div className="field-group"><label>Receiver BIC</label><input placeholder="Enter Receiver BIC" value={searchState.receiver} onChange={set("receiver")} onKeyDown={handleKeyDown}/></div>
                            <div className="field-group"><label>Phase</label><DynSelect value={searchState.phase} onChange={set("phase")} placeholder="All Phases" options={opts.phases} loading={optsLoading}/></div>
                            <div className="field-group"><label>Action</label><DynSelect value={searchState.action} onChange={set("action")} placeholder="All Actions" options={opts.actions} loading={optsLoading}/></div>
                            <div className="field-group"><label>Reason</label><input placeholder="Enter Reason" value={searchState.reason} onChange={set("reason")} onKeyDown={handleKeyDown}/></div>
                            <div className="field-group"><label>Correspondent</label><input placeholder="Correspondent" value={searchState.correspondent} onChange={set("correspondent")} onKeyDown={handleKeyDown}/></div>
                        </div>
                        <div className="row">
                            <div className="field-group"><label>Amount From</label><input type="number" placeholder="Min Amount" value={searchState.amountFrom} onChange={set("amountFrom")} onKeyDown={handleKeyDown}/></div>
                            <div className="field-group"><label>Amount To</label><input type="number" placeholder="Max Amount" value={searchState.amountTo} onChange={set("amountTo")} onKeyDown={handleKeyDown}/></div>
                            <div className="field-group"><label>Currency (CCY)</label><DynSelect value={searchState.currency} onChange={set("currency")} placeholder="All Currencies" options={opts.currencies} loading={optsLoading}/></div>
                            <div className="field-group"><label>Owner / Unit</label><DynSelect value={searchState.ownerUnit} onChange={set("ownerUnit")} placeholder="All Units" options={opts.ownerUnits} loading={optsLoading}/></div>
                            <div className="field-group"><label>Message Reference</label><input placeholder="Message Reference" value={searchState.messageReference} onChange={set("messageReference")} onKeyDown={handleKeyDown}/></div>
                        </div>
                        <div className="row">
                            <div className="field-group"><label>Seq No. From</label><input type="number" placeholder="e.g. 1" value={searchState.seqFrom} onChange={set("seqFrom")} onKeyDown={handleKeyDown}/></div>
                            <div className="field-group"><label>Seq No. To</label><input type="number" placeholder="e.g. 9999" value={searchState.seqTo} onChange={set("seqTo")} onKeyDown={handleKeyDown}/></div>
                            <div className="field-group field-group-wide"><label>UETR</label><input className="input-wide" placeholder="Enter UETR (e.g. 8a562c65-...)" value={searchState.uetr} onChange={set("uetr")} onKeyDown={handleKeyDown}/></div>
                        </div>
                        <div className="row" style={{alignItems:"flex-end"}}>
                            <div className="field-group field-group-wide"><label>Free Search Text</label><input className="input-wide" placeholder="Searches across all fields..." value={searchState.freeSearchText} onChange={set("freeSearchText")} onKeyDown={handleKeyDown}/></div>
                            <div className="field-group"><label>Channel / Session</label><DynSelect value={searchState.backendChannel} onChange={set("backendChannel")} placeholder="All Channels" options={opts.backendChannels.length?opts.backendChannels:opts.networkChannels} loading={optsLoading}/></div>
                        </div>
                    </>)}
                </div>
            )}

            {/* ══════════ ADVANCED SEARCH PANEL ══════════ */}
            {searchMode==="advanced"&&(
                <div className={`search-panel adv-panel${panelCollapsed?" panel-collapsed":""}`}>
                    <div className="panel-section-title" onClick={()=>setPanelCollapsed(p=>!p)} style={{cursor:"pointer"}}>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <span>Advanced Search</span>
                            {advancedFields.length>0&&<span className="filter-badge">{advancedFields.length} field{advancedFields.length!==1?"s":""}</span>}
                            <span className="adv-mode-chip"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>Dynamic</span>
                        </div>
                        <span className="collapse-icon">{panelCollapsed?"▼ Expand":"▲ Collapse"}</span>
                    </div>
                    {!panelCollapsed&&(<>
                        <div className="adv-toolbar">
                            <div className="adv-picker-wrap" ref={fieldPickerRef}>
                                <button className="adv-add-btn" onClick={()=>setShowFieldPicker(p=>!p)}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                    Add Search Field
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginLeft:2}}><polyline points="6 9 12 15 18 9"/></svg>
                                </button>
                                {showFieldPicker&&(
                                    <div className="adv-picker-dropdown">
                                        <div className="adv-picker-search">
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/></svg>
                                            <input placeholder="Search fields..." value={fieldPickerQuery} onChange={e=>setFieldPickerQuery(e.target.value)} autoFocus/>
                                            {fieldPickerQuery&&<button className="adv-picker-clear" onClick={()=>setFieldPickerQuery("")}>&#x2715;</button>}
                                        </div>
                                        <div className="adv-picker-body">
                                            {Object.keys(groupedFields).length===0&&<div className="adv-picker-empty">{advancedFields.length===FIELD_DEFINITIONS.length?"All fields added":"No fields match"}</div>}
                                            {Object.entries(groupedFields).map(([group,items])=>(
                                                <div key={group} className="adv-picker-group">
                                                    <div className="adv-picker-group-label">{group}</div>
                                                    {items.map(f=>(
                                                        <button key={f.key} className="adv-picker-item" onClick={()=>addAdvancedField(f.key)}>
                                                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                                            {f.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            {advancedFields.length>0&&(<button className="adv-clear-fields-btn" onClick={()=>{setAdvancedFields(["dateRange"]);setSearchState(initialSearchState);}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>Clear all fields</button>)}
                            <div className="adv-info-text"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>Result table shows only columns for selected fields</div>
                        </div>
                        <div className="adv-fixed-date-wrap">{renderAdvancedField("dateRange")}</div>
                        {advancedFields.filter(f=>f!=="dateRange").length===0&&(
                            <div className="adv-empty-state">
                                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--gray-4)" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="11" y1="8" x2="11" y2="14"/></svg>
                                <p>No search fields added yet</p><span>Click "Add Search Field" to choose which fields to search on</span>
                            </div>
                        )}
                        {advancedFields.filter(f=>f!=="dateRange").length>0&&(
                            <div className="adv-fields-grid">{advancedFields.filter(f=>f!=="dateRange").map(fkey=>renderAdvancedField(fkey))}</div>
                        )}
                    </>)}
                </div>
            )}

            {/* ── Action Bar (Fixed / Advanced only) ── */}
            {searchMode !== "rawcopies" && (
                <div className="action-bar">
                    <div className="action-left">
                        <button className={`search-btn${isSearching?" btn-loading":""}`} onClick={handleSearch} disabled={isSearching}>
                            {isSearching?(<><span className="spinner"/>Searching...</>):(<><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/></svg>Search</>)}
                        </button>
                        <button className="clear-btn" onClick={handleClear}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>Reset</button>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:16}}>
                        {searchMode==="advanced"&&advancedFields.length>0&&(
                            <div className="adv-active-fields-strip">{advancedFields.map(fkey=>{ const def=FIELD_DEFINITIONS.find(f=>f.key===fkey); return def?<span key={fkey} className="adv-active-chip">{def.label}</span>:null; })}</div>
                        )}
                        <div className="action-hint"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>Press Enter in any field to search</div>
                    </div>
                </div>
            )}

            {/* ── Results (Fixed / Advanced only) ── */}
            {searchMode !== "rawcopies" && showResult&&(<>
                <div className="stats-row">
                    {summaryStats.map((s,i)=>(<div key={i} className="stat-card" style={{"--stat-color":s.color}}><span className="stat-value">{s.value.toLocaleString()}</span><span className="stat-label">{s.label}</span></div>))}
                    <div className="stats-spacer"/>
                    {searchMode==="fixed"&&(
                        <div className="col-manager-wrap" ref={colManagerRef}>
                            <button className="tool-btn" onClick={()=>setShowColManager(p=>!p)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>Columns ({shownCols.length}/{allColumns.length})</button>
                            {showColManager&&<div className="col-manager-dropdown"><div className="col-manager-title">Toggle Columns</div><div className="col-manager-grid">{allColumns.map(col=>(<label key={col.key} className="col-toggle-item"><input type="checkbox" checked={visibleCols.has(col.key)} onChange={()=>toggleCol(col.key)}/><span>{col.label}{col.isDynamic&&<span style={{fontSize:9,marginLeft:4,background:"var(--accent-light)",color:"var(--accent)",padding:"1px 5px",borderRadius:3,fontWeight:600}}>NEW</span>}</span></label>))}</div></div>}
                        </div>
                    )}
                    {searchMode==="advanced"&&advancedResultCols&&(
                        <div className="adv-cols-info"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>{advancedResultCols.length} column{advancedResultCols.length!==1?"s":""} shown</div>
                    )}
                    <div className="export-wrap" ref={exportMenuRef}>
                        <button className="tool-btn tool-btn-primary" onClick={()=>!isExporting&&setShowExportMenu(p=>!p)} disabled={isExporting}>
                            {isExporting?<><span className="spinner" style={{borderTopColor:"var(--accent)",borderColor:"var(--accent-mid)"}}/>Exporting…</>:<><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Export<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg></>}
                        </button>
                        {showExportMenu&&<div className="export-dropdown">
                            <div className="export-scope-section"><div className="export-scope-header"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>Export Scope</div>
                            <div className="export-scope-tabs">{scopeTabs.map(s=>{
                                const isDisabled = s.key==="selected" && selectedRows.size===0;
                                return <button key={s.key} className={`export-scope-tab${exportScope===s.key?" export-scope-active":""}`} style={isDisabled?{opacity:0.4,cursor:"not-allowed",pointerEvents:"all"}:{}} onClick={()=>{ if(isDisabled){ showToast("No rows selected","error"); return; } setExportScope(s.key); }} title={isDisabled?"Select rows first":undefined}><span className="scope-tab-label">{s.label}</span><span className="scope-tab-count">{typeof s.count==="number"?s.count.toLocaleString():s.count}</span></button>;
                            })}</div></div>
                            <div className="export-format-divider"><span>Format</span></div>
                            <button className="export-opt" onClick={()=>runExport(exportScope,"csv")}><span className="export-opt-icon export-icon-csv">CSV</span><span className="export-opt-info"><span className="export-opt-name">Comma Separated</span><span className="export-opt-ext">.csv</span></span></button>
                            <button className="export-opt" onClick={()=>runExport(exportScope,"excel")}><span className="export-opt-icon export-icon-xlsx">XLS</span><span className="export-opt-info"><span className="export-opt-name">Excel Workbook</span><span className="export-opt-ext">.xlsx</span></span></button>
                            <button className="export-opt" onClick={()=>runExport(exportScope,"json")}><span className="export-opt-icon export-icon-json">JSON</span><span className="export-opt-info"><span className="export-opt-name">JSON Data</span><span className="export-opt-ext">.json</span></span></button>
                        </div>}
                    </div>
                </div>

                {Object.keys(colFilters).some(k=>colFilters[k])&&<div className="active-filters-bar"><span className="af-label">Table filters:</span>{Object.entries(colFilters).filter(([,v])=>v).map(([k,v])=>(<span key={k} className="af-chip">{allColumns.find(c=>c.key===k)?.label}: {v}<button className="af-remove" onClick={()=>handleColFilter(k,"")}>&#x2715;</button></span>))}<button className="af-clear-all" onClick={()=>setColFilters({})}>Clear all</button></div>}

                <div className="table-wrapper" ref={tableWrapperRef} onScroll={syncScroll}>
                    <table style={{width:`calc(100% + ${extraWidth}px)`,minWidth:`calc(100% + ${extraWidth}px)`}}>
                        <thead><tr>
                            <th className="row-num-th">#</th>
                            <th className="ref-th">Reference</th>
                            {shownCols.map(col=>{
                                const cw=colWidths[col.key];
                                return (
                                    <th key={col.key} className={activeCol===col.key?"active-col":""} style={cw?{width:cw,minWidth:cw,maxWidth:cw}:{}} onClick={()=>setActiveCol(p=>p===col.key?null:col.key)}>
                                        <div className="th-label">
                                            <span className="th-text" onClick={e=>{e.stopPropagation();handleSort(col.key);}}>{col.label}{sortIcon(col.key)}</span>
                                            <span className="search-icon"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/></svg></span>
                                        </div>
                                        <span className="col-resize-handle" title="Drag to resize. Double-click to reset."
                                            onMouseDown={e=>{const th=e.currentTarget.closest("th");handleColResizeStart(e,col.key,th);}}
                                            onDoubleClick={e=>{e.stopPropagation();resetColWidth(col.key);}}/>
                                        {activeCol===col.key&&<input className="col-search-input" placeholder={`Filter ${col.label}...`} value={colFilters[col.key]||""} onClick={e=>e.stopPropagation()} onChange={e=>handleColFilter(col.key,e.target.value)} autoFocus/>}
                                    </th>
                                );
                            })}
                        </tr></thead>
                        <tbody>
                            {currentRecords.length>0?currentRecords.map((msg,idx)=>{
                                const msgId=getMsgId(msg);
                                return(<tr key={msgId} className={selectedRows.has(msgId)?"row-selected":""} onClick={()=>toggleRow(msgId)}>
                                    <td className="row-num-td">{indexOfFirst+idx+1}</td>
                                    <td className="ref-td"><button className="ref-link" onClick={e=>openModal(msg,e,idx)}>{getReference(msg)}</button></td>
                                    {shownCols.map(col=>(<td key={col.key}>{renderCell(col,msg)}</td>))}
                                </tr>);
                            }):(
                                <tr><td colSpan={shownCols.length+2} className="no-result"><div className="no-result-inner"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--gray-4)" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><p>No messages found</p><span>Try adjusting your search criteria</span></div></td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="bottom-scrollbar" ref={bottomScrollRef} onScroll={syncScroll}><div className="scroll-inner" style={{width:`calc(100% + ${extraWidth}px)`}}/></div>

                {totalPages>=1&&<div className="pagination-bar">
                    <div className="pagination-left"><span className="record-range">Showing <strong>{indexOfFirst+1}&ndash;{Math.min(indexOfFirst+currentRecords.length,serverTotal)}</strong> of <strong>{serverTotal.toLocaleString()}</strong> records</span></div>
                    <div className="pagination-center">
                        <button className="pg-btn pg-edge" onClick={()=>handlePageClick(1)} disabled={currentPage===1}>&#xAB;&#xAB;</button>
                        <button className="pg-btn" onClick={()=>handlePageClick(Math.max(1,currentPage-1))} disabled={currentPage===1}>&#x2039; Prev</button>
                        {startPage>1&&<span className="pg-ellipsis">…</span>}
                        {[...Array(pagesPerGroup)].map((_,i)=>{ const p=startPage+i; if(p>totalPages)return null; return <button key={p} className={`pg-btn pg-num${currentPage===p?" pg-active":""}`} onClick={()=>handlePageClick(p)}>{p}</button>; })}
                        {startPage+pagesPerGroup-1<totalPages&&<span className="pg-ellipsis">…</span>}
                        <button className="pg-btn" onClick={()=>handlePageClick(Math.min(totalPages,currentPage+1))} disabled={currentPage===totalPages}>Next &#x203A;</button>
                        <button className="pg-btn pg-edge" onClick={()=>handlePageClick(totalPages)} disabled={currentPage===totalPages}>&#xBB;&#xBB;</button>
                    </div>
                    <div className="pagination-right">
                        <label className="pg-label">Go to</label>
                        <input className="pg-goto" type="number" min="1" max={totalPages} value={goToPage} placeholder="pg" onChange={e=>setGoToPage(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"){const p=parseInt(goToPage);if(p>=1&&p<=totalPages)handlePageClick(p);setGoToPage("");}}}/>
                        <span className="pg-of-total">of {totalPages}</span><span className="pg-divider"/>
                        <label className="pg-label">Rows</label>
                        <select className="pg-rows-select" value={recordsPerPage} onChange={e=>{setRecordsPerPage(Number(e.target.value));setCurrentPage(1);setStartPage(1);}}>
                            <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option>
                        </select>
                    </div>
                </div>}
            </>)}

            {/* ── Multi-Window Floating Modals ── */}
            {openModals.length > 0 && (
                <div className="fm-layer">
                    {openModals.map(modal => (
                        <FloatingModal key={modal.id} modal={modal} processed={processed}
                            onClose={closeModal} onBringToFront={bringToFront} onPatch={patchModal}
                            onPrev={goModalPrev} onNext={goModalNext}
                            getDisplayFormat={getDisplayFormat} getDisplayType={getDisplayType}
                            statusCls={statusCls} dirClass={dirClass} formatDirection={formatDirection}
                        />
                    ))}
                    {openModals.length > 1 && (
                        <button className="fm-close-all" onClick={closeAllModals}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            Close all ({openModals.length} open)
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

export default Search;