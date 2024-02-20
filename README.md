# NTNU Course Sentry

Get notified when your favorite courses are enrollable!

## Usage

Build the Docker image, then mount your config!

[Config Example](packages/sentry/config.example.yml)

```yml
targets:
    - "1234" # serial number of the course
    - "2345" # serial number of the course

settings:
    year: 112 # required
    term: 1 # required
    interval: 15 # in seconds, required

notification:
    discord: https://discord.com/api/webhooks/<CHANNEL>/<TOKEN>
```

> By default, if there is any course available, it will notify through the stdout. If you want to use Discord, you can set the `discord` field in the `notification` section, however, this is not required.
