-- 1. Add user binding columns
alter table computer_use_sessions 
add column if not exists user_id uuid references auth.users(id),
add column if not exists device_name text default 'Desktop App';

-- 2. Enable RLS
alter table computer_use_sessions enable row level security;

-- 3. Policy: Owners can see their own devices
create policy "Users can see own devices"
on computer_use_sessions for select
using (auth.uid() = user_id);

-- 4. Policy: Owners can update their own devices (e.g. rename)
create policy "Users can update own devices"
on computer_use_sessions for update
using (auth.uid() = user_id);

-- 5. Policy: Desktop Apps (Anon) can insert/update themselves (by machine_id)
-- Note: This is an open policy for the prototype. In prod, you'd secure this further.
create policy "Desktop apps can upsert themselves"
on computer_use_sessions for all
using (user_id is null) -- Can manage untied rows
with check (user_id is null); -- Can't steal other rows

-- 6. Secure Function to Claim a Device
create or replace function claim_device(code text, name text)
returns json
language plpgsql
security definer -- Runs with admin privileges to bypass RLS for the lookup
as $$
declare
  updated_row json;
begin
  -- Validate input
  if code is null or length(code) < 6 then
    raise exception 'Invalid code format';
  end if;

  -- Attempt to claim
  update computer_use_sessions
  set 
    user_id = auth.uid(), -- Assign to current user
    device_name = coalesce(name, 'Desktop App'),
    status = 'active',
    updated_at = now()
  where 
    connection_code = code 
    and user_id is null -- Ensure it's not already claimed
  returning to_json(computer_use_sessions.*) into updated_row;

  if updated_row is null then
    raise exception 'Device not found or already claimed';
  end if;

  return updated_row;
end;
$$;
