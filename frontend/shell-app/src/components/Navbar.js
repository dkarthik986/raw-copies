import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../AuthContext";
import BrandLogo from "./BrandLogo";

function getExpiry(token) {
  try {
    const p = JSON.parse(atob(token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));
    return p?.exp ? p.exp * 1000 : null;
  } catch { return null; }
}

function SessionTimer({ collapsed }) {
  const [msLeft, setMsLeft] = useState(null);
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const expiry = getExpiry(token);
    if (!expiry) return;
    const tick = () => setMsLeft(Math.max(0, expiry - Date.now()));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  if (msLeft === null) return null;
  const totalSec = Math.floor(msLeft / 1000);
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  const p  = n => String(n).padStart(2, "0");
  const str = hh > 0 ? `${p(hh)}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`;
  const color = msLeft === 0 || msLeft < 60000 ? "#ef4444" : msLeft < 300000 ? "#f97316" : msLeft < 900000 ? "#eab308" : "#22c55e";
  const bg    = msLeft === 0 || msLeft < 60000 ? "#fef2f2" : msLeft < 300000 ? "#fff7ed" : msLeft < 900000 ? "#fefce8" : "#f0fdf4";
  const crit  = msLeft < 60000;

  if (collapsed) return (
    <div title={`Session: ${str}`} style={{ width:8, height:8, borderRadius:"50%", background:color, margin:"4px auto", boxShadow: crit ? `0 0 6px ${color}` : "none" }} />
  );
  return (
    <div style={{ display:"flex", alignItems:"center", gap:7, padding:"6px 10px", borderRadius:8, background:bg, border:`1px solid ${color}22`, margin:"0 8px 4px" }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" style={{ flexShrink:0 }}>
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:10, color:"#94a3b8", fontWeight:500 }}>Session expires in</div>
        <div style={{ fontSize:13, fontWeight:700, color, fontFamily:"monospace", letterSpacing:"0.05em" }}>
          {msLeft === 0 ? "Expired" : str}
        </div>
      </div>
    </div>
  );
}

export default function Navbar({ onOpenTab, appName = "SWIFT Platform" }) {
  const { user, logout } = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotif,    setShowNotif]    = useState(false);
  const [collapsed,    setCollapsed]    = useState(false);
  const dropdownRef = useRef(null);
  const notifRef    = useRef(null);

  useEffect(() => {
    const h = e => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowDropdown(false);
      if (notifRef.current    && !notifRef.current.contains(e.target))    setShowNotif(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const initials = name => name?.split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase() || "?";

  const navItems = [
    { route: "search", label: "Message Search", icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
    )},
    ...(user?.role === "ADMIN" ? [{ route: "users", label: "User Management", icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    )}] : []),
    { route: "profile", label: "Profile", icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
      </svg>
    )},
  ];

  return (
    <aside className={`shell-sidebar ${collapsed ? "collapsed" : ""}`}>
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="brand-icon" style={{background:"transparent", padding:0, overflow:"hidden"}}>
          <BrandLogo variant="sidebar" />
        </div>
        {!collapsed && (
          <div className="brand-text">
            <span className="brand-name">{appName.split(" ")[0]}</span>
            <span className="brand-tag">{appName.split(" ").slice(1).join(" ") || "Platform"}</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {!collapsed && <p className="sidebar-section-label">Menu</p>}
        {navItems.map(item => (
          <button key={item.route} className="sidebar-link" onClick={() => onOpenTab(item.route)} title={item.label}>
            {item.icon}
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* Bottom */}
      <div className="sidebar-bottom">
        <button className="sidebar-action-btn" onClick={() => setCollapsed(!collapsed)}
          style={{ borderBottom:"1px solid var(--border)", marginBottom:4, paddingBottom:12 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent: collapsed ? "center" : "flex-start", gap:10, width:"100%" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {collapsed ? <polyline points="9 18 15 12 9 6"/> : <polyline points="15 18 9 12 15 6"/>}
            </svg>
            {!collapsed && <span>Collapse</span>}
          </div>
        </button>

        <SessionTimer collapsed={collapsed} />

        {/* Notifications */}
        <div ref={notifRef} style={{ position:"relative" }}>
          <button className={`sidebar-action-btn ${showNotif ? "active" : ""}`}
            onClick={() => { setShowNotif(v => !v); setShowDropdown(false); }} title="Notifications">
            <div className="sidebar-action-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              <span className="badge">3</span>
            </div>
            {!collapsed && <span>Notifications</span>}
          </button>
          {showNotif && (
            <div className="notif-panel sidebar-notif-panel" style={{ position:"fixed", bottom:"130px", left: collapsed ? "72px" : "220px", zIndex:99999, minWidth:"260px", background:"var(--surface)", borderRadius:"var(--radius-lg)", boxShadow:"var(--shadow-xl)", border:"1px solid var(--border)" }}>
              <div className="notif-header"><span>Notifications</span><span className="notif-count">3 New</span></div>
              {[
                { title: "New SWIFT message received",   time: "2 min ago" },
                { title: "System maintenance scheduled", time: "1 hr ago"  },
                { title: "User access updated",          time: "3 hrs ago" },
              ].map((n, i) => (
                <div key={i} className="notif-item">
                  <div className="notif-dot" />
                  <div><p className="notif-title">{n.title}</p><p className="notif-time">{n.time}</p></div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* User menu */}
        <div ref={dropdownRef} style={{ position:"relative" }}>
          <button className="sidebar-user-btn"
            onClick={() => { setShowDropdown(v => !v); setShowNotif(false); }} title={user?.name}>
            <div className="user-avatar">{initials(user?.name)}</div>
            {!collapsed && (
              <div className="user-info">
                <span className="user-name">{user?.name}</span>
                <span className="user-role">{user?.role}</span>
              </div>
            )}
          </button>
          {showDropdown && (
            <div className="user-dropdown sidebar-user-dropdown" style={{ position:"fixed", bottom:"70px", left: collapsed ? "72px" : "220px", zIndex:99999, minWidth:"220px", background:"var(--surface)", borderRadius:"var(--radius-lg)", boxShadow:"var(--shadow-xl)", border:"1px solid var(--border)", padding:"8px" }}>
              <div className="dropdown-user-info">
                <div className="dropdown-avatar">{initials(user?.name)}</div>
                <div>
                  <p className="dropdown-name">{user?.name}</p>
                  <p className="dropdown-id">{user?.employeeId}</p>
                </div>
              </div>
              <div className="dropdown-divider" />
              <button className="dropdown-item" onClick={() => { setShowDropdown(false); onOpenTab("profile"); }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
                My Profile
              </button>
              <button className="dropdown-item logout" onClick={() => { setShowDropdown(false); logout(); }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}