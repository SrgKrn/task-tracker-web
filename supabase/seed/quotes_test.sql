-- Тестовые цитаты для проверки блока «Время» на стенде и в тестовом аккаунте.
-- По две на каждую тему и general, плюс по одной на два контекста — видно, как работает откат
-- «контекст → тема → general». В живую базу не загружать: там — набор из quotes/*.csv.
insert into quotes (text, author, source, tags, verified) values
  ('Тестовая цитата 1', 'Тестовый автор', null, '{streak,rhythm}', false),
  ('Тестовая цитата 2', 'Тестовый автор', null, '{day_record,rhythm}', false),
  ('Тестовая цитата 3', 'Тестовый автор', null, '{rhythm}', false),
  ('Тестовая цитата 4', 'Тестовый автор', null, '{rhythm}', false),
  ('Тестовая цитата 5', 'Тестовый автор', null, '{sprint_closed,clients}', false),
  ('Тестовая цитата 6', 'Тестовый автор', null, '{client_share,clients}', false),
  ('Тестовая цитата 7', 'Тестовый автор', null, '{clients}', false),
  ('Тестовая цитата 8', 'Тестовый автор', null, '{clients}', false),
  ('Тестовая цитата 9', 'Тестовый автор', null, '{general}', false),
  ('Тестовая цитата 10', 'Тестовый автор', null, '{general}', false)
on conflict (text, author) do nothing;
