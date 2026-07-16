-- Optional demo seed. Replace with your real stations before the event.

insert into public.stations (
  sort_order,
  code,
  scan_token,
  title,
  body_markdown,
  image_url,
  points,
  clue_requires_solution,
  clue_prompt_text,
  clue_prompt_image_url,
  clue_answer_keys,
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
    true,
    'What small animal is printed in the corner of the welcome sign?',
    null,
    array['fox', 'a fox'],
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
    false,
    null,
    null,
    '{}'::text[],
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
  clue_requires_solution = excluded.clue_requires_solution,
  clue_prompt_text = excluded.clue_prompt_text,
  clue_prompt_image_url = excluded.clue_prompt_image_url,
  clue_answer_keys = excluded.clue_answer_keys,
  hint_text = excluded.hint_text,
  hint_image_url = excluded.hint_image_url,
  hint_penalty = excluded.hint_penalty,
  is_active = excluded.is_active;
