-- Optional PostgreSQL/Supabase target policies.
-- The Sites deployment uses D1 and enforces identical ownership constraints in
-- server-side prepared queries. Apply these policies when the Supabase adapter
-- is enabled for a production environment.

alter table users enable row level security;
alter table user_profiles enable row level security;
alter table user_preferences enable row level security;
alter table uploaded_cvs enable row level security;
alter table candidate_facts enable row level security;
alter table saved_jobs enable row level security;
alter table rejected_jobs enable row level security;
alter table applications enable row level security;
alter table generated_documents enable row level security;
alter table notification_preferences enable row level security;
alter table notification_consents enable row level security;

create policy users_own_record on users for all using (id = auth.uid()::text) with check (id = auth.uid()::text);
create policy profiles_owned on user_profiles for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
create policy preferences_owned on user_preferences for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
create policy cvs_owned on uploaded_cvs for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
create policy facts_owned on candidate_facts for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
create policy saved_jobs_owned on saved_jobs for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
create policy rejected_jobs_owned on rejected_jobs for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
create policy applications_owned on applications for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
create policy documents_owned on generated_documents for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
create policy notification_preferences_owned on notification_preferences for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
create policy notification_consents_owned on notification_consents for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
