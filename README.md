# alexa-pagerduty
Unofficial PagerDuty Alexa skill that uses the PagerDuty calendar feed

_Disclaimer: I am not affiliated with PagerDuty in any way._

## Setup

1. [Register](https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/registering-and-managing-alexa-skills-in-the-developer-portal) a new Alexa skill, noting the `applicationId`. Copy and paste the Intent Schema from `intents.json` and Sample Utterances from `utterances.txt`.
2. Log into PagerDuty, go to your Profile, and find the link to your iCalendar file under the User Settings tab.
3. Edit `package.json` to set `alexa.applicationId` and `pagerDuty.url`.
4. Run `npm install`.
5. Zip up `index.js`, `package.json`, and the `node_modules` directory.
6. [Create](https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/developing-an-alexa-skill-as-a-lambda-function) an AWS Lambda function and upload the zip file.
