import sqlalchemy as sa
engine = sa.create_engine('postgresql+psycopg://zoikohr_admin:66715771fb4148e9230b5c4efd34dc90c2b71a1f8439328c@34.88.254.128:5432/zoikohr?sslmode=require')
with engine.connect() as conn:
    missing = []
    for col in ['body_html', 'channels', 'target_type', 'audience', 'status', 'sent_at']:
        result = conn.execute(sa.text(f"SELECT column_name FROM information_schema.columns WHERE table_name='super_admin_notifications' AND column_name='{col}'"))
        if not result.fetchone():
            missing.append(col)
    
    if missing:
        for col in missing:
            if col == 'body_html':
                conn.execute(sa.text(f"ALTER TABLE super_admin_notifications ADD COLUMN {col} TEXT NULL"))
            elif col == 'channels':
                conn.execute(sa.text(f"ALTER TABLE super_admin_notifications ADD COLUMN {col} JSON NULL"))
            elif col == 'target_type':
                conn.execute(sa.text(f"ALTER TABLE super_admin_notifications ADD COLUMN {col} VARCHAR(20) NOT NULL DEFAULT 'all'"))
            elif col == 'audience':
                conn.execute(sa.text(f"ALTER TABLE super_admin_notifications ADD COLUMN {col} VARCHAR(20) NOT NULL DEFAULT 'org_admins'"))
            elif col == 'status':
                conn.execute(sa.text(f"ALTER TABLE super_admin_notifications ADD COLUMN {col} VARCHAR(20) NOT NULL DEFAULT 'sent'"))
            elif col == 'sent_at':
                conn.execute(sa.text(f"ALTER TABLE super_admin_notifications ADD COLUMN {col} TIMESTAMP NULL"))
        conn.commit()
        print(f"Added columns: {missing}")
    else:
        print("All columns already exist")