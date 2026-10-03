import sqlalchemy as sa
engine = sa.create_engine('postgresql+psycopg://zoikohr_admin:66715771fb4148e9230b5c4efd34dc90c2b71a1f8439328c@34.88.254.128:5432/zoikohr?sslmode=require')
with engine.connect() as conn:
    result = conn.execute(sa.text("SELECT column_name FROM information_schema.columns WHERE table_name='employees' ORDER BY ordinal_position"))
    existing = set(r[0] for r in result.fetchall())
    print("Existing employee columns:")
    for c in ["mfa_enabled", "mfa_secret", "mfa_enrolled_at", "mfa_backup_codes"]:
        print(f"  {c}: {'EXISTS' if c in existing else 'MISSING'}")
    
    if 'mfa_enabled' not in existing:
        conn.execute(sa.text("ALTER TABLE employees ADD COLUMN mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE"))
        print("Added mfa_enabled")
    if 'mfa_secret' not in existing:
        conn.execute(sa.text("ALTER TABLE employees ADD COLUMN mfa_secret VARCHAR(255)"))
        print("Added mfa_secret")
    if 'mfa_enrolled_at' not in existing:
        conn.execute(sa.text("ALTER TABLE employees ADD COLUMN mfa_enrolled_at TIMESTAMP"))
        print("Added mfa_enrolled_at")
    if 'mfa_backup_codes' not in existing:
        conn.execute(sa.text("ALTER TABLE employees ADD COLUMN mfa_backup_codes JSON NOT NULL DEFAULT '[]'::json"))
        print("Added mfa_backup_codes")
    
    print("\nAll MFA columns are now present in the employees table!")