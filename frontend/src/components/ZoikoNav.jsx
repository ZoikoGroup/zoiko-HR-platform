import React, { useState } from "react";

export default function ZoikoNav() {
  const [active, setActive] = useState(null);

  const links = ["Platform", "Products", "Solutions", "Pricing", "Resources", "Company"];

  return (
    <div style={S.wrapper}>
      <nav style={S.nav}>
        {/* Logo */}
        <div style={S.logo}>
          <div style={S.logoIcon}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M8 22L20 6" stroke="#f97316" strokeWidth="3.5" strokeLinecap="round"/>
              <path d="M8 6L8 22" stroke="#2d4fd6" strokeWidth="3.5" strokeLinecap="round"/>
            </svg>
          </div>
          <span style={S.logoText}>
            ZoikoOne<sup style={S.tm}>™</sup>
          </span>
        </div>

        {/* Nav Links */}
        <ul style={S.links}>
          {links.map((link) => (
            <li key={link}>
              <button
                style={{
                  ...S.link,
                  ...(active === link ? S.linkActive : {}),
                }}
                onMouseEnter={() => setActive(link)}
                onMouseLeave={() => setActive(null)}
              >
                {link}
              </button>
            </li>
          ))}
        </ul>

        {/* Right Actions */}
        <div style={S.actions}>
          <button style={S.signIn}>Sign In</button>
          <button style={S.demo}>Get a Demo &nbsp;→</button>
        </div>
      </nav>
    </div>
  );
}

const S = {
  wrapper: {
    background: "#f0f0f5",
    padding: "16px 24px 0",
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
    borderRadius: "24px 24px 0 0",
    overflow: "hidden",
  },
  nav: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#ffffff",
    padding: "10px 18px 10px 14px",
    boxShadow: "0 2px 16px rgba(0,0,0,0.07)",
    gap: 16,
  },

  /* Logo */
  logo: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    textDecoration: "none",
    flexShrink: 0,
  },
  logoIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    background: "linear-gradient(135deg,#eef2ff 0%,#f5f0ff 100%)",
    border: "1px solid #e0e0ee",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    fontSize: 18,
    fontWeight: 800,
    color: "#1a1a4e",
    letterSpacing: "-0.3px",
  },
  tm: {
    fontSize: 10,
    fontWeight: 400,
    verticalAlign: "super",
  },

  /* Nav links */
  links: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    listStyle: "none",
    margin: 0,
    padding: 0,
    flex: 1,
    justifyContent: "center",
  },
  link: {
    background: "transparent",
    border: "none",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 14.5,
    fontWeight: 500,
    color: "#1a1a4e",
    cursor: "pointer",
    transition: "background 0.15s",
  },
  linkActive: {
    background: "#f5f5fb",
    color: "#1a1a4e",
  },

  /* Right */
  actions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  signIn: {
    background: "transparent",
    border: "none",
    borderRadius: 8,
    padding: "9px 16px",
    fontSize: 14.5,
    fontWeight: 700,
    color: "#1a1a4e",
    cursor: "pointer",
  },
  demo: {
    background: "#f97316",
    color: "#fff",
    border: "none",
    borderRadius: 50,
    padding: "11px 22px",
    fontSize: 14.5,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
};
