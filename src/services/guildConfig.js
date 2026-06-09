
const GUILD_CONFIG_DEFAULTS = {
    prefix: BotConfig.prefix,
    modRole: null,
    adminRole: null,
    logChannelId: null,
    welcomeChannel: null,
    welcomeMessage: 'Welcome {user} to {server}!',
    autoRole: null,
    dmOnClose: true,
    logIgnore: { users: [], channels: [] },
    logging: {
        enabled: false,
        channelId: null,
        enabledEvents: {}
    },
    music: {           // ← add this so it survives normalize/validate
        queue: [],
        volume: 100,
        playing: false
    }
};