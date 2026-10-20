-- Цитаты дня больше не нужны: в 0.38 их заменила плитка дня, теперь убираем и данные.
-- Остальное из 0019 (timezone, show_time_block, completed_at) работает дальше — не трогаем.

drop table if exists quote_impressions;
drop table if exists quotes;
