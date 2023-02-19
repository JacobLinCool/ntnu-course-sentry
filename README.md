# NTNU Course Sentry

Get notified when your favorite courses are enrollable!

## Usage

Build the Docker image, then mount your config!

[Config Example](packages/sentry/config.example.yml)

```yml
auth:
    username: YOUR_USERNAME
    password: YOUR_PASSWORD

targets:
    - "0512" # 教育社會學（教）的「開課序號」

settings:
    interval: 60 # seconds

notifications:
    discord: DISCORD_WEBHOOK_URL
```

> By default, if there is any course available, it will notify through the stdout. If you want to use Discord, you can set the `discord` field in the `notifications` section, however, this is not required.
