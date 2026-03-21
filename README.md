# Enzymess Dental — Patient Information System

## Local Development

```bash
npm install
node migrate-passwords.js   # run once to hash passwords
node server.js              # start server
```

Open: http://localhost:3000

## Add a Dentist

```bash
node server.js --add-dentist username:password:version
# version: 1=basic, 2=standard, 3=scheduling, 4=all features
# example:
node server.js --add-dentist "DrLee:Lee#1234:4"
```

## Deploy to Railway

See DEPLOY.md for full instructions.
