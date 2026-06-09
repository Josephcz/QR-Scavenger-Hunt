-- Optional demo seed. Replace with your real stations before the event.

insert into public.stations (
  sort_order,
  code,
  scan_token,
  title,
  body_markdown,
  image_url,
  points,
  hint_prompt_text,
  hint_prompt_image_url,
  hint_answer_key,
  hint_text,
  hint_image_url,
  hint_penalty,
  is_active
)
values
  (
    1,
    'ST-A7K2P9QX',
    'scan_3kfpO2YxKbrGpjqN',
    'The Welcome Sign',
    'Nice work. Your next QR is near the place where people first picked up their event materials.',
    null,
    10,
    'Optional mini-puzzle: what animal is printed in the corner of the welcome sign?',
    null,
    'fox',
    'The next QR is near registration, but not on the registration desk itself.',
    null,
    3,
    true
  ),
  (
    2,
    'ST-M4L8R2TZ',
    'scan_Wa8BqU5nN2mZc1',
    'Registration Table',
    'Great. Now look for the area where people would take a group photo.',
    null,
    10,
    'Optional mini-puzzle: count the number of blue stars in the registration image.',
    null,
    '7',
    'Look for a backdrop, banner, or photo corner.',
    null,
    3,
    true
  )
on conflict (sort_order) do update set
  code = excluded.code,
  scan_token = excluded.scan_token,
  title = excluded.title,
  body_markdown = excluded.body_markdown,
  image_url = excluded.image_url,
  points = excluded.points,
  hint_prompt_text = excluded.hint_prompt_text,
  hint_prompt_image_url = excluded.hint_prompt_image_url,
  hint_answer_key = excluded.hint_answer_key,
  hint_text = excluded.hint_text,
  hint_image_url = excluded.hint_image_url,
  hint_penalty = excluded.hint_penalty,
  is_active = excluded.is_active;
