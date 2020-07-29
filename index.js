const Discord = require('discord.js');
const bot = new Discord.Client();
const config = require('./config.json');
const needle = require('needle');

const regexLink = /\[\[(.*?)\]\]/g;
const regexTemp = /\{\{(.*?)\}\}/g;
const regexRaw  = /\-\-(.*?)\-\-/g;

const TYPE_NORMAL = 'normal';
const TYPE_TEMPLATE = 'template';
const TYPE_RAW = 'raw';

var wikis = require('./_wikis.json');
const db = require('better-sqlite3')('_prefs.db');

bot.once('ready', () => {
    db.prepare('CREATE TABLE IF NOT EXISTS guilds (GuildID TEXT NOT NULL PRIMARY KEY, WikiKey TEXT NOT NULL)').run();
    db.prepare('CREATE TABLE IF NOT EXISTS channels (ChannelID TEXT NOT NULL PRIMARY KEY, WikiKey TEXT NOT NULL)').run();
    bot.user.setActivity(`Nindies | ${config.prefix}help`, {type: 'PLAYING'});
    console.log(`Ready at ${new Date().toUTCString()} - ${bot.guilds.cache.size} guilds, ${bot.channels.cache.size} channels, ${bot.users.cache.size} users`);
});

bot.on('message', async msg => {
    if (msg.author.bot) {
        return;
    }
    if (msg.cleanContent.startsWith(config.prefix)) {
        [cmd, ...args] = msg.cleanContent.split(' ');
        switch (cmd.replace(config.prefix, '')) {
            case 'serverWiki': {
                if (msg.channel.type !== 'dm' && !msg.member.hasPermission('ADMINISTRATOR') && msg.user.id !== config.adminId) {
                    return;
                }

                if (msg.channel.type === 'dm') {
                    msg.channel.send('Please use `channelWiki` to set the preferred wiki for our private conversations!');
                    return;
                }

                let wikiKey = realWikiName(args.join(' '));
                if (wikiKey) {
                    try {
                        db.prepare('INSERT INTO guilds (GuildID, WikiKey) VALUES(?, ?) ON CONFLICT(GuildID) DO UPDATE SET WikiKey=excluded.WikiKey').run(msg.guild.id, wikiKey);
                        msg.channel.send(`The wiki for this server has been successfully set to **${getWikiObj(wikiKey).name}**!`);
                    } catch(e) {
                        msg.channel.send('Sorry, something went wrong. Please try again. If the issue persists, please contact invalidCards#0380 with a description of your issue.');
                        console.error(e);
                    }
                } else {
                    msg.channel.send(`Sorry, I did not recognise the wiki **${args.join(' ')}**. Please make sure you typed it correctly and try again. For a full list, use *${config.prefix}list*.`);
                }
                break;
            }
            case 'channelWiki': {
                if (msg.channel.type !== 'dm' && !msg.member.hasPermission('ADMINISTRATOR') && msg.user.id !== config.adminId) {
                    return;
                }

                if (msg.channel.type !== dm) {
                    let serverRow = db.prepare('SELECT * FROM guilds WHERE GuildID=?').get(msg.guild.id);
                    if (!serverRow) {
                        msg.channel.send(`Please set the default wiki for the guild first with *${config.prefix}serverWiki*.`);
                    }
                }

                if (args.join(' ') === 'default') {
                    if (msg.channel.type === 'dm') {
                        msg.channel.send(`Sorry, you can't remove the set wiki of a private conversation. You can still change it with this command - for a full list, use *${config.prefix}list*.`);
                        return;
                    }
                    try {
                        db.prepare('DELETE FROM channels WHERE ChannelID=?').run(msg.channel.id);
                        msg.channel.send(`The wiki for this channel has been reset to the default for the server.`);
                    } catch(e) {
                        msg.channel.send('Sorry, something went wrong. Please try again. If the issue persists, please contact invalidCards#0380 with a description of your issue.');
                        console.error(e);
                    }
                } else {
                    let wikiKey = realWikiName(args.join(' '));
                    if (wikiKey) {
                        try {
                            db.prepare('INSERT INTO channels (ChannelID, WikiKey) VALUES (?, ?) ON CONFLICT(ChannelID) DO UPDATE SET WikiKey=excluded.WikiKey').run(msg.channel.id, wikiKey);
                            msg.channel.send(`The wiki for this channel has been successfully set to **${getWikiObj(wikiKey).name}**!`);
                        } catch(e) {
                            msg.channel.send('Sorry, something went wrong. Please try again. If the issue persists, please contact invalidCards#0380 with a description of your issue.');
                            console.error(e);
                        }
                    } else {
                        msg.channel.send(`Sorry, I did not recognise the wiki **${args.join(' ')}**. Please make sure you typed it correctly and try again. For a full list, use *${config.prefix}list*.`);
                    }
                }
                break;
            }
            case 'reloadWikis': {
                if (msg.user.id !== config.adminId) {
                    return;
                }
                delete require.cache[require.resolve('./_wikis.json')];
                wikis = require('./_wikis.json');
                msg.channel.send('Wiki JSON reloaded from file!');
                break;
            }
            case 'list': {
                let embed = new Discord.MessageEmbed().setColor('#B22222').setTitle('Available wikis').setDescription(`The following is a list of available wikis and their aliases. Both the full wiki name and all aliases can be used to set a wiki using \`${config.prefix}serverWiki\` and \`${config.prefix}clientWiki\`, as well as to make a one-time lookup to another wiki other than the default of the server or channel.`).setTimestamp();
                for (wikiData of wikis) {
                    let aliases = wikiData.aliases;
                    aliases.unshift(wikiData.key);
                    embed.addField(wikiData.name, aliases.join(', '), true);
                }
                embed.addField('Unsupported wikis', `The following wikis are not supported by WOB:
• Hard Drop runs a very old version of MediaWiki, and its API is not compatible with the inner workings of this bot.
• Pikmin Fanon is shutting down on September 1st, 2020, and will not be supported by this bot in the meantime.`);
                msg.channel.send(embed);
                break;
            }
            case 'help': {
                let embed = new Discord.MessageEmbed().setColor('#B22222').setTitle('WOB Help').setTimestamp();
                embed.addField('Commands', `
• \`${config.prefix}serverWiki <wiki>\` - sets the server's default wiki to the given wiki
• \`${config.prefix}channelWiki <wiki>\` - overrides the server's default wiki for the current channel
• \`${config.prefix}channelWiki default\` - removes a previously set override for the current channel
• \`${config.prefix}list\` - lists all available wikis and their aliases
• \`${config.prefix}help\` - display this help message`);

                embed.addField('Linking syntax', `
• \`[[search term]]\` - uses the API of the default wiki of the channel or server to find an existing page with the same name
• \`[[bp:search term]]\` - uses the API of a wiki that is not the default channel or server wiki (in this case Bulbapedia) to find an existing page with the same name (see \`${config.prefix}list\` for a full list of usable aliases)
• \`{{search term}}\` - uses the API (same as above) to find an existing template with the same name
• \`--search term--\` - creates a direct link to the search term, regardless of whether or not the page exists`);

                embed.addField('Feedback and suggestions', 'If you have any ideas, or features you are missing, please contact `invalidCards#0380` with your suggestion, and I will try to add it to the bot!');
                embed.addField('Code', 'The bot is fully open-source - you can look at [its GitHub repo](https://github.com/invalidCards/WikiOperatingBuddy) to see the complete inner workings!');
                msg.channel.send(embed);
                break;
            }
        }
    } else {
        let content = msg.cleanContent;
        content = content.replace(/\`\`\`.*?\`\`\`/gm, '');
        content = content.replace(/\`.*?\`/gm, '');
        content = content.replace(/https?[^ ]+?/gm, '');
        let links = [];
        if (content.search(regexLink) > -1) {
            let matches = Array.from(content.matchAll(regexLink), m => m[1]);
            for (let match of matches) {
                links.push({type: TYPE_NORMAL, query: match});
            }
        }
        if (content.search(regexTemp) > -1) {
            let matches = Array.from(content.matchAll(regexTemp), m => m[1]);
            for (let match of matches) {
                links.push({type: TYPE_TEMPLATE, query: match});
            }
        }
        if (content.search(regexRaw) > -1) {
            let matches = Array.from(content.matchAll(regexRaw), m => m[1]);
            for (let match of matches) {
                links.push({type: TYPE_RAW, query: match});
            }
        }
        if (links.length) {
            let wiki = db.prepare('SELECT WikiKey FROM channels WHERE ChannelID=?').get(msg.channel.id);
            if (!wiki) {
                if (msg.channel.type === 'dm') {
                    msg.channel.send(`Our private conversation does not have a wiki set. Please use the *${config.prefix}channelWiki* command to set it up.`);
                    return;
                }
                wiki = db.prepare('SELECT WikiKey FROM guilds WHERE GuildID=?').get(msg.guild.id);
                if (!wiki) {
                    msg.channel.send(`This server doesn't have a default wiki set yet. If you are an admin, use *${config.prefix}serverWiki* to set one. If you're not, go yell at one.`);
                    return;
                } else {
                    wiki = wiki.WikiKey;
                }
            } else {
                wiki = wiki.WikiKey;
            }
            let messageContent = '**Wiki links detected:**';
            for (let linkData of links) {
                if (linkData.query.includes(':')) {
                    let [altWiki, ...actualQuery] = linkData.query.split(':');
                    if (realWikiName(altWiki)) {
                        let wikiLink = '';
                        switch (linkData.type) {
                            case TYPE_NORMAL:
                                wikiLink = await fetchLink(altWiki, actualQuery.join(':').toLowerCase());
                                break;
                            case TYPE_TEMPLATE:
                                wikiLink = await fetchLink(altWiki, `Template:${actualQuery.join(':').toLowerCase()}`);
                                break;
                            case TYPE_RAW:
                                wikiLink = fetchRawLink(altWiki, actualQuery.join(':'));
                                break;
                        }
                        if (wikiLink) {
                            messageContent += `\n<${wikiLink}>`;
                        }
                        continue;
                    }
                }
                let wikiLink = '';
                switch (linkData.type) {
                    case TYPE_NORMAL:
                        wikiLink = await fetchLink(wiki, linkData.query.toLowerCase());
                        break;
                    case TYPE_TEMPLATE:
                        wikiLink = await fetchLink(wiki, `Template:${linkData.query.toLowerCase()}`);
                        break;
                    case TYPE_RAW:
                        wikiLink = fetchRawLink(wiki, linkData.query);
                        break;
                }
                if (wikiLink) {
                    messageContent += `\n<${wikiLink}>`;
                }
            }
            if (messageContent.split('\n').length > 1) {
                msg.channel.send(messageContent);
            }
        }
    }
});

const realWikiName = (abbreviation) => {
    let wiki = wikis.filter(w => w.key === abbreviation);
    if (wiki.length) return wiki[0].key;
    wiki = wikis.filter(w => w.name === abbreviation);
    if (wiki.length) return wiki[0].key;
    wiki = wikis.filter(w => w.aliases.includes(abbreviation));
    if (wiki.length) return wiki[0].key;
    return false;
};

const getWikiObj = (wikiName) => {
    let wiki = wikis.filter(w => w.key === realWikiName(wikiName));
    if (wiki.length) return wiki[0];
    return false;
}

const getWikiBaseUrl = (wikiName) => {
    let wiki = wikis.filter(w => w.key === realWikiName(wikiName));
    if (wiki.length) return wiki[0].url;
    return false;
};

const fetchLink = async (wikiName, article) => {
    let response = await needle('get', `${getWikiBaseUrl(wikiName)}/api.php?action=opensearch&search=${encodeURI(article)}&limit=1&redirects=resolve`);
    if (!response.body[1].length) return false;
    return response.body[3][0];
};

const fetchRawLink = (wikiName, article) => {
    let wiki = wikis.filter(w => w.key === realWikiName(wikiName));
    if (!wiki.length) return false;
    return `${wiki[0].articleUrl}/${article}`;
}

bot.login(config.token);