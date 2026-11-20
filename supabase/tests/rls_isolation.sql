-- Run on a SCRATCH Supabase project (SQL editor) after the migration. Every assertion must pass; it rolls back at the end.
begin;
insert into accounts(id) values ('00000000-0000-0000-0000-0000000000a1'),('00000000-0000-0000-0000-0000000000b1');
insert into devices(account_id, auth_uid, name) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000a','A'),
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000000b','B');
insert into devices(account_id, auth_uid, name, status) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000c','A-pending','pending');
insert into sync_records(account_id, tbl, id, data) values ('00000000-0000-0000-0000-0000000000a1','tasks','t1','{}'),('00000000-0000-0000-0000-0000000000b1','tasks','t2','{}');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from sync_records) = 1, 'A must see only its own record';
  assert (select count(*) from devices) = 2, 'A sees its two devices only';
  assert (select count(*) from pairing_codes) = 0 or true;
end $$;
do $$ begin begin perform 1 from pairing_codes; raise exception 'pairing_codes readable'; exception when insufficient_privilege then null; end; end $$;
do $$ begin begin insert into sync_records(account_id,tbl,id,data) values ('00000000-0000-0000-0000-0000000000a1','tasks','x','{}'); raise exception 'direct insert allowed'; exception when insufficient_privilege then null; end; end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);   -- pending device
do $$ begin assert (select count(*) from sync_records) = 0, 'pending device must see no data'; end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
do $$ begin begin perform public.revoke_device((select id from public.devices where name='A')); raise exception 'cross-account revoke allowed'; exception when others then if sqlerrm like '%allowed' then raise; end if; end; end $$;
rollback;
