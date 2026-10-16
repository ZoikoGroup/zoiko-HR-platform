"""Just-in-time support access through temporary, read-only tenant sign-ins.

A platform operator asks for access to one organization, an admin of that organization approves (or rejects) it, and the
operator then generates a one-time username and password that sign in to that organization's workspace for 5, 15 or 30
minutes. The session is read-only (every write is refused by the privacy middleware), can be revoked by the tenant at any
time, and every page it opens is logged for the tenant to see.
"""
