-- Voegt de standaardvakken met codes toe voor elk gezin dat nog geen vak
-- met die code heeft. Idempotent (mag veilig opnieuw gedraaid worden).
insert into public.subjects (family_id, name, code, icon, created_by)
select p.family_id, v.name, v.code, v.icon, p.id
from public.profiles p
cross join (
  values
    ('Wiskunde', 'WI', 'calculator'),
    ('Aardrijkskunde', 'AK', 'globe'),
    ('Duits', 'DU', 'language'),
    ('Engels', 'EN', 'language'),
    ('Frans', 'FA', 'language'),
    ('Geschiedenis', 'GS', 'history'),
    ('Levensbeschouwing', 'LS', 'book-open'),
    ('Nederlands', 'NE', 'language'),
    ('Natuurkunde/Scheikunde', 'NS', 'flask')
) as v(name, code, icon)
where p.role = 'ouder'
on conflict (family_id, code) do nothing;
