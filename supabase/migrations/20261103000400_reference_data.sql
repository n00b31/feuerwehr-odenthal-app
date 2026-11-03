begin;

insert into public.units(code, name, pilot) values
  ('scheuren', 'Scheuren', true), ('odenthal', 'Odenthal', false), ('blecher', 'Blecher', false),
  ('eikamp', 'Eikamp', false), ('voiswinkel', 'Voiswinkel', false);
insert into public.special_functions(code, name) values
  ('equipment', 'Gerätewarte'), ('clothing', 'Kleiderkammer'), ('breathing', 'Atemschutz');

commit;
