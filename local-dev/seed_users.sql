-- Seed SOC Users (bcrypt hash of "Analyst@2024!" )

INSERT INTO jhi_user (id, login, password_hash, first_name, last_name, email, activated, lang_key, created_by, created_date)
VALUES
  (NEXTVAL('jhi_user_id_seq'), 'analyst.chen',    '$2a$10$gSAhZrxMllrbgj/kkK9UceBPpChGWJA7SYIb1Mqo.n5sPjA28Unk2', 'Sarah',  'Chen',     'sarah.chen@hivearmor.local',     true, 'en', 'admin', NOW()),
  (NEXTVAL('jhi_user_id_seq'), 'analyst.patel',   '$2a$10$gSAhZrxMllrbgj/kkK9UceBPpChGWJA7SYIb1Mqo.n5sPjA28Unk2', 'Raj',    'Patel',    'raj.patel@hivearmor.local',      true, 'en', 'admin', NOW()),
  (NEXTVAL('jhi_user_id_seq'), 'soc.manager',     '$2a$10$gSAhZrxMllrbgj/kkK9UceBPpChGWJA7SYIb1Mqo.n5sPjA28Unk2', 'Karen',  'Martinez', 'karen.martinez@hivearmor.local', true, 'en', 'admin', NOW()),
  (NEXTVAL('jhi_user_id_seq'), 'analyst.okonkwo', '$2a$10$gSAhZrxMllrbgj/kkK9UceBPpChGWJA7SYIb1Mqo.n5sPjA28Unk2', 'Chidi',  'Okonkwo',  'chidi.okonkwo@hivearmor.local',  true, 'en', 'admin', NOW());

INSERT INTO jhi_user_authority (user_id, authority_name)
SELECT id, 'ROLE_USER' FROM jhi_user WHERE login IN ('analyst.chen', 'analyst.patel', 'soc.manager', 'analyst.okonkwo');

INSERT INTO jhi_user_authority (user_id, authority_name)
SELECT id, 'ROLE_ANALYST' FROM jhi_user WHERE login IN ('analyst.chen', 'analyst.patel', 'soc.manager', 'analyst.okonkwo');

INSERT INTO jhi_user_authority (user_id, authority_name)
SELECT id, 'ROLE_SOC_MANAGER' FROM jhi_user WHERE login = 'soc.manager';
