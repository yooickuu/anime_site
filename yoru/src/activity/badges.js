export const badges=[
 ['episode_1','🌱',['Первый шаг','First step','はじめの一歩'],['Завершить 1 серию','Finish 1 episode','1話を完了']],
 ['episode_10','🎬',['В потоке','In the flow','夢中'],['Завершить 10 серий','Finish 10 episodes','10話を完了']],
 ['episode_50','🎞️',['За кадром','Beyond the frame','物語の奥へ'],['Завершить 50 серий','Finish 50 episodes','50話を完了']],
 ['episode_100','💯',['Сотня историй','A hundred chapters','百の物語'],['Завершить 100 серий','Finish 100 episodes','100話を完了']],
 ['episode_500','🐉',['Легенда сёнэна','Shonen legend','少年伝説'],['Завершить 500 серий','Finish 500 episodes','500話を完了']],
 ['hour_1','⏳',['Час приключений','Adventure hour','冒険の時間'],['Посмотреть 1 час','Watch for 1 hour','1時間視聴']],
 ['hour_10','🏃',['Марафонщик','Marathon runner','マラソン走者'],['Посмотреть 10 часов','Watch for 10 hours','10時間視聴']],
 ['hour_50','🧭',['Путешественник','Traveler','旅人'],['Посмотреть 50 часов','Watch for 50 hours','50時間視聴']],
 ['hour_100','🌌',['Другой мир','Another world','異世界'],['Посмотреть 100 часов','Watch for 100 hours','100時間視聴']],
 ['hour_500','👑',['Хранитель историй','Story keeper','物語の守り人'],['Посмотреть 500 часов','Watch for 500 hours','500時間視聴']],
 ['title_1','🏁',['До титров','To the credits','最後まで'],['1 аниме в «Просмотрено»','1 completed anime','視聴済み作品1本']],
 ['title_10','📚',['Знаток','Connoisseur','通'],['10 аниме в «Просмотрено»','10 completed anime','視聴済み作品10本']],
 ['title_50','🎌',['Отаку','Otaku','オタク'],['50 аниме в «Просмотрено»','50 completed anime','視聴済み作品50本']],
 ['night','🦉',['Ночная сова','Night owl','夜ふかし'],['10 минут просмотра между 00:00 и 05:00','Watch 10 minutes between midnight and 5 AM','午前0〜5時に10分視聴']],
 ['message','💬',['Душа компании','Social butterfly','話し上手'],['Отправить первое сообщение','Send your first message','初めてのメッセージ']],
 ['comment','✍️',['Есть мнение','A voice of your own','自分の意見'],['Написать первый комментарий','Post your first comment','初めてのコメント']],
 ['friend','🤝',['На одной волне','On the same wavelength','気が合う'],['Добавить первого друга','Make your first friend','初めての友達']],
 ['favorites','💜',['Личная классика','Personal classics','私の名作'],['Добавить 10 аниме в любимые','Favorite 10 anime','お気に入り10作品']]
];
export const text=(values,lang)=>values[({ru:0,en:1,ja:2})[lang]??0];
export function watchLabel(seconds,lang){const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60);return text([`Высмотрено: ${h} ч ${m} мин`,`Watched: ${h} h ${m} min`,`視聴時間：${h}時間${m}分`],lang);}
