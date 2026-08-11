# src/modules

This folder groups the main Zoiko product modules under a single shared root.

## Main modules

- `zoiko-hr`
- `zoikotime`
- `payroll`
- `billing`
- `comply`
- `insights`

## Purpose

Each module folder should contain the pages and components for that product area. For example, `zoiko-hr` contains the HR module root plus its subfolders like `workforce`, `leave`, `attendance`, and so on.

## Example structure

- `src/modules/zoiko-hr/index.tsx` — Zoiko HR entry page
- `src/modules/zoiko-hr/workforce/index.tsx` — HR workforce page
- `src/modules/payroll/index.tsx` — Zoiko Payroll entry page

If you want, I can also wire these folders into the routing config next.
