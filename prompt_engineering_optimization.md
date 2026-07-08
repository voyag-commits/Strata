prompt engineering optimization

use clear and highly abstract prompt to guide LLM.   A high quality initial context A plus high quality context B can lead to ~20mins of structured work, for change author. 

Therefore, cycle's quality depends on context A(human write) and context B(agent write)'s quality, because each dispatch message come with 3 major components: fixed prompt template, context A, context B export. And the quality of fixed prompt to hint what context B behave cascade to downstream context B quality incrementally by each context B submission. (worst case: a bad prompt to guide context B will lead to exploded context B body with high noise.)

how to let agent write the report.

To keep the work trackable within our team, write... in dropbox....(this part is covered by existing prompt)

how to write: In your report, select 3 of following topics that applied to your role and work.

1. specific code changes that is resolved by

I need you to write a document to reflect your recent action and identification. 1. what is the correct wsl distro name. 2. what previous problems that handed over you and applied. 3. 

