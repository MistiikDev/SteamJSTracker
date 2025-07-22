/*

    Discord Imports, Code, Directories
    
*/
import dotenv from 'dotenv';
import fs from 'fs';
import schedule from 'node-schedule'
import { Client, IntentsBitField, EmbedBuilder, MessageCollector, SlashCommandBuilder, Embed, PermissionFlagsBits,  AuditLogEvent, Events, AuditLogOptionsType, GuildAuditLogs  } from 'discord.js'
import { AvoidBranches, Flags, BranchNameParser, reverseNameParser, getClosestDate, getTimeUnit } from '../index.js'
import { error } from 'console';

dotenv.config();

const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.GuildMessageReactions,
        IntentsBitField.Flags.MessageContent,
        IntentsBitField.Flags.DirectMessages,
        IntentsBitField.Flags.DirectMessageTyping,
    ]
})

const channel_cache = (('./Data/Discord/channel_ids.json'))
const timeoutDuration = 5 * 60 * 1000
const reactionCooldown = new Set();

let channelSetsArray = []

let FetchingErrorMSG = "The bot tried to access a {} that was deleted or removed by another actor. The configuration for it has been disabled for your server. If you wish to recover the functionality, run the [] command and follow the instructions."

const nametoDirMap = {
    [process.env.SITEURL]: "./Medias/bin/webScraperMedias/sbtvscreenShot.png",
    [process.env.MOVIEURL]: "./Medias/bin/webScraperMedias/univmoviescreenShot.png",
    [process.env.FNFMOVIEURL]: "./Medias/bin/webScraperMedias/fnfmoviescreenShot.png",
    [process.env.STMURL]: "./Medias/bin/webScraperMedias/stmscreenShot.png",
    [process.env.STMDBURL]: "./Medias/bin/webScraperMedias/steamdbscreenShot.png",
    [process.env.STMDBDLCURL]: "./Medias/bin/webScraperMedias/steamdbruinscreenShot.png"
}

/*
    Common functions
*/

function getServerData() {
    try {
        const data = fs.readFileSync(channel_cache);
        if (!data.toString()) {
            return {};
        }
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading server data:', error);
        return {};
    }
}

function saveServerData(serverData) {
    try {
        fs.writeFileSync(channel_cache, JSON.stringify(serverData));
    } catch (error) {
        console.error('Error writing server data:', error);
    }
}

function GuildMessageHandler(cachedServerData, guildID, Embed, Options) {
    const channelID = cachedServerData[guildID].channel_id;
    const pingRoleID = cachedServerData[guildID].role_id;

    if (channelID) {
        const guild = client.guilds.cache.get(guildID);
        const channel = guild.channels.cache.get(channelID);

        if (channel && channel.type === 0 || channel.type === 5) {
            const imageFilePath = nametoDirMap[Options.url];
            const file = {
                attachment: imageFilePath,
                name: imageFilePath.split("/").pop()
            };

            if (pingRoleID != undefined) {
                channel.send(`<@&${pingRoleID}>`);
            }

            channel.send({
                embeds: [Embed],
                files: [file]
            });
        } else {
            return console.log("No text channel was found in the guild:", guildID);
        }
    } else {
        return console.log("No server was found in DB for ID:", guildID);
    }
}

function SendData(Embed, Options, AllServers) {
    client.guilds.fetch();

    if (AllServers) {
        const serverData = getServerData();

        for (const guild of client.guilds.cache.values()) {
            if (serverData[guild.id]) {
                GuildMessageHandler(serverData, guild.id, Embed, Options)
            }
        }
    } else {
        const guildID = Options.guildId;

        const serverData = getServerData();
        if (serverData[guildID]) {
            GuildMessageHandler(serverData, guildID, Embed, Options)
        }
    }
}

async function DeleteDataForGuild(guildID) {
    const serverData = getServerData()

    try {
        if (serverData && serverData[guildID]) {
            // Delete messages 
            client.guilds.fetch()

            const guild = client.guilds.cache.get(guildID)
            if (guild) {
                const reactionChannelID = serverData[guildID].reaction_channel_id
                const reactionChannel = guild.channels.cache.get(reactionChannelID)

                try {
                    if (reactionChannel) {
                        const messages = await reactionChannel.messages.fetch({ limit: 50, cache: false }, async (messages) => {
                            messages.filter(m => m.author.id === client.user.id)

                            console.log(`Collected ${messages.size} messages to delete.`)
                        })
                    }
                }
                catch (error) {
                    console.log("An error occured during the message deletion process in guild : ", guildID, error)
                }
            }

            delete serverData[guildID]
            saveServerData(serverData)

            console.log("Data successfully removed for guild : ", guildID)

            return true
        }

        return false
    } catch (error) {
        console.log("An error occured during data erasure : ", error)

        return false
    }
}

/*
    Twitter inheritance
*/

export async function EmbedForWebChanges(Differences, header, url) {
    if (Differences.added && Differences.added.length > 0 || Differences.removed && Differences.removed.length > 0 || Differences.changed && Differences.changed.length > 0) {
        let Message = header

        let Added = Differences.added.length;
        let Removed = Differences.removed.length;
        let Modified = Differences.changed.length

        const embed = new EmbedBuilder()
            .setTitle(header)
            .setColor("DarkPurple")
            .setDescription("RUINTracker has detected modifications")
            .setImage(nametoDirMap[url] != undefined ? "attachment://" + nametoDirMap[url].split("/").pop() : null)
            .setAuthor({
                name: client.user.tag,
                iconURL: client.user.displayAvatarURL()
            })
            .addFields([
                {
                    name: "Elements added",
                    value: Added.toString(),
                    inline: true
                },
                {
                    name: "Elements edited",
                    value: Modified.toString(),
                    inline: true
                },
                {
                    name: "Elements removed",
                    value: Removed.toString(),
                    inline: true
                }
            ])
            .setURL(url)
            .setTimestamp(timestamp != undefined ? timestamp : Date.now())
            .setFooter({ text: "@RUINTracker automated by DAF", iconURL: client.user.displayAvatarURL() });


        SendData(embed, { url: url }, true);
    }
}

export async function EmbedForGameChanges(Data, url) {
    if (Object.keys(Data).length > 0) {
        let Message = "📁 Security Breach CHANGES DETECTED!\n"
        const OriginalMessage = Message

        let usedBranches = {} // Fazbot info tracking branches

        if (Object.keys(Data).length > 0) {
            let Message = "📁 Security Breach CHANGES DETECTED!\n"
            const OriginalMessage = Message
            let usedBranches = {}
            let fields = []

            const embed = new EmbedBuilder()
                .setTitle(Message)
                .setColor("Red")
                .setDescription("RUINTracker has detected modifications")
                .setImage(nametoDirMap[url] != undefined ? "attachment://" + nametoDirMap[url].split("/").pop() : null)
                .setAuthor({
                    name: client.user.tag + " has detected something:",
                    iconURL: client.user.displayAvatarURL()
                })
                .setURL(url)
                .setTimestamp(Date.now())
                .setFooter({ text: "@RUINTracker automated by DAF", iconURL: client.user.displayAvatarURL() });

            for (const branch in Data) {

                let AvoidingBranch = false

                for (const B in AvoidBranches) {
                    if (branch.toLowerCase().includes(AvoidBranches[B].toLowerCase())) {
                        AvoidingBranch = true
                    }
                }

                if (branch && !AvoidingBranch) {
                    let branchData = (Data[branch])[1]
                    let branchSubName = "Shipment"

                    if ((Data[branch])[1].hasOwnProperty("Dev")) {
                        const branchPredictions = getClosestDate((Data[branch])[1].Dev, (Data[branch])[1].Ship)

                        branchData = branchPredictions.date
                        branchSubName = branchPredictions.isDevDateChosen && "Dev" || "Shipment"

                    } else {
                        branchData = (Data[branch])[1].Ship
                    }

                    const diff = Math.round(Date.now() - new Date(branchData))
                    const timeUnit = getTimeUnit(diff).result
                    let branchName = branch

                    if (branch.toLowerCase() == "chowda") {
                        branchName = "RUIN DLC"
                    }

                    usedBranches[branchName] = branchName

                    let FlagMessage = ""
                    let FinalString = Flags[branch]

                    if (FinalString == undefined) {
                        let newBranch = reverseNameParser(branch, BranchNameParser)

                        if (branch.toLowerCase() == "chowda") {
                            newBranch = "chowda"
                        }

                        FinalString = Flags[newBranch]
                    }

                    if (FinalString != "" && FinalString != null) {
                        FlagMessage += "🏳️ Flag for branch: "
                        FlagMessage += FinalString
                    }

                    fields.push({
                        name: branchName + " branch updated " + timeUnit.toString() + " ago on: " + (branchData) + ((Data[branch])[1].ChangeID && " (change history: " + (Data[branch])[1].ChangeID + ")" || ""),
                        value: FlagMessage,
                        inline: true
                    })
                }
            }

            if (fields != [] && fields.length > 0) {
                embed.addFields(fields)
                SendData(embed, { url: url }, true);
            }
        }
    }
}

export async function EmbedForBranchAddedRemoved(Data, header, url) {
    if ((Data[0] && Data[1]) && (Object.keys(Data[0]).length > 0 || Object.keys(Data[1]).length > 0)) {
        let Message = header
        let fields = []

        const OriginalMessage = Message
        const embed = new EmbedBuilder()
            .setTitle(header)
            .setColor("Navy")
            .setDescription("RUINTracker has detected modifications")
            .setImage(nametoDirMap[url] != undefined ? "attachment://" + nametoDirMap[url].split("/").pop() : null)
            .setAuthor({
                name: client.user.tag + " has detected something:",
                iconURL: client.user.displayAvatarURL()
            })

            .setURL(url)
            .setTimestamp(Date.now())
            .setFooter({ text: "@RUINTracker automated by DAF.", iconURL: client.user.displayAvatarURL() });

        if (Object.keys(Data[0]).length > 0) {
            for (const newBranch in Data[0]) {
                fields.push({
                    name: newBranch.toString(),
                    value: "Branch Status: Added",
                    inline: true
                })
            }
        }

        if (Object.keys(Data[1]).length > 0) {
            for (const oldBranch in Data[1]) {
                fields.push({
                    name: oldBranch.toString(),
                    value: "Branch Status: Removed",
                    inline: true
                })
            }
        }

        embed.addFields(fields)

        SendData(embed, { url: url }, true);
    }
}

export async function EmbedForRUINChanges(Differences, header, url,) {
    if (Differences.added && Differences.added.length > 0 || Differences.removed && Differences.removed.length > 0 || Differences.edited && Differences.edited.length > 0) {
        let Message = header
        let Added = Differences.added
        let Removed = Differences.removed
        let Modified = Differences.edited
        let fields = []

        const OriginalMessage = Message

        const embed = new EmbedBuilder()
            .setTitle(header)
            .setColor("LuminousVividPink")
            .setDescription("RUINTracker has detected modifications")
            .setImage(nametoDirMap[url] != undefined ? "attachment://" + nametoDirMap[url].split("/").pop() : null)
            .setAuthor({
                name: client.user.tag + " has detected something:",
                iconURL: client.user.displayAvatarURL()
            })

            .setURL(url)
            .setTimestamp(Date.now())
            .setFooter({ text: "@RUINTracker automated by DAF.", iconURL: client.user.displayAvatarURL() });


        for (let addedElement of Added) {
            fields.push({
                name: "Element: " + addedElement[0] + " added",
                value: "New Value: " + addedElement[1]
            })
        }

        for (let removedElement of Removed) {
            fields.push({
                name: "Element: " + removedElement[0] + " removed",
                value: "New Value: " + removedElement[1]
            })
        }

        for (let modifiedElement of Modified) {
            fields.push({
                name: "Element: " + modifiedElement[0] + " modified",
                value: "New Value: " + modifiedElement[1]
            })
        }

        embed.addFields(fields)

        SendData(embed, { url: url }, true);
    }
}

export async function EmbedForSteamPageModifications(Data, header, url) {
    if (Data[0]) {
        let Message = header
        const OriginalMessage = Message
        const embed = new EmbedBuilder()
            .setTitle(header)
            .setColor("DarkGold")
            .setDescription("RUINTracker has detected modifications")
            .setImage(nametoDirMap[url] != undefined ? "attachment://" + nametoDirMap[url].split("/").pop() : null)
            .setAuthor({
                name: client.user.tag + " has detected something:",
                iconURL: client.user.displayAvatarURL()
            })

            .addFields([{
                name: "New Modification Date",
                value: new Date(Data[1] * 1000).toUTCString(),
                inline: true
            },
            {
                name: "Old Modification Date",
                value: new Date(Data[2] * 1000).toUTCString(),
                inline: true
            }])

            .setURL(url)
            .setTimestamp(Date.now())
            .setFooter({ text: "@RUINTracker automated by DAF.", iconURL: client.user.displayAvatarURL() });

        SendData(embed, { url: url }, true);
    }
}

/*
    Listeners, setup
*/

async function AskForChannelID(message, serverData, admin, dmChannel, channelSetupInProgress, guildID) {
    return new Promise((resolve, reject) => {
        dmChannel
            .send('Please provide the **Channel ID** for RUINTracker to post messages and updates.')
            .then(() => {
                const filter = (responseMessage) => responseMessage.author.id === admin.id;
                const collector = new MessageCollector(dmChannel, filter, { time: 180000 });

                collector.on('collect', (responseMessage) => {
                    const channelId = responseMessage.content.trim();

                    const guild = client.guilds.cache.get(guildID)
                    const channel = guild.channels.cache.get(channelId)

                    if (!channel) {
                        dmChannel.send('Invalid channel ID. Please try again.');
                    } else {
                        serverData[guildID] = {
                            channel_id: channelId,
                            reaction_channel_id: null,
                            role_id: null,
                        };

                        saveServerData(serverData);
                        message.reply('Channel ID has been set up for the bot.');

                        collector.stop();
                        resolve();
                    }
                });

                collector.on('end', (collected, reason) => {
                    if (reason === 'time') {
                        console.log(`No response received for guild ${guildID}`);
                        message.reply('Channel ID setup cancelled.');
                        channelSetupInProgress.delete(guildID);
                        channelSetsArray = channelSetsArray.filter((set) => set !== channelSetupInProgress);
                        reject(new Error('No response received for channel ID setup.'));
                    }
                });
            })
            .catch((error) => {
                console.error(`Error sending DM to admin for guild ${guildID}:`, error);
                message.reply('An error occurred while setting up the channel ID. Please try again later.');
                channelSetupInProgress.delete(guildID);
                channelSetsArray = channelSetsArray.filter((set) => set !== channelSetupInProgress);
                reject(error);
            });
    });
}

async function AskForRoleID(message, serverData, admin, dmChannel, channelSetupInProgress, guildID, guild) {
    return new Promise((resolve, reject) => {
        dmChannel
            .send('Please provide the **ROLE ID** for the bot to ping *(or "NO" if you do not want to ping anyone for every update.*).')
            .then(() => {
                const filter = (responseMessage) => responseMessage.author.id === admin.id;
                const roleCollector = new MessageCollector(dmChannel, filter, { time: 180000 });

                roleCollector.on('collect', (roleResponseMessage) => {
                    const roleInput = roleResponseMessage.content.trim();

                    if (roleInput.toUpperCase() === 'NO') {
                        dmChannel.send('Role ID setup cancelled.');
                        roleCollector.stop();
                        channelSetupInProgress.delete(guildID);
                        channelSetsArray = channelSetsArray.filter((set) => set !== channelSetupInProgress);
                        reject(new Error('Role ID setup cancelled.'));
                    } else {
                        const role = guild.roles.cache.get(roleInput);

                        if (!role) {
                            dmChannel.send('Invalid role ID. Please try again.');
                        } else {
                            serverData[guildID].role_id = roleInput;
                            saveServerData(serverData);
                            message.reply('Role ID has been set up for the bot.');

                            roleCollector.stop();
                            resolve();
                        }
                    }
                });

                roleCollector.on('end', (collected, reason) => {
                    if (reason === 'time') {
                        console.log(`No response received for guild ${guildID}`);
                        message.reply('Role ID setup cancelled.');
                        channelSetupInProgress.delete(guildID);
                        channelSetsArray = channelSetsArray.filter((set) => set !== channelSetupInProgress);
                        reject(new Error('No response received for role ID setup.'));
                    }
                });
            })
            .catch((error) => {
                console.error(`Error sending DM to admin for guild ${guildID}:`, error);
                message.reply('An error occurred while setting up the role ID. Please try again later.');
                channelSetupInProgress.delete(guildID);
                channelSetsArray = channelSetsArray.filter((set) => set !== channelSetupInProgress);
                reject(error);
            });
    });
}

async function AskForReactionChannelID(message, serverData, admin, dmChannel, channelSetupInProgress, guildID, guild) {
    return new Promise((resolve, reject) => {
        dmChannel
            .send('Please provide the **Channel ID** for the reaction role embed (*or "NO" if you wish to handle the role by yourself.*).')
            .then(() => {
                const filter = (responseMessage) => responseMessage.author.id === admin.id;
                const channelCollector = new MessageCollector(dmChannel, filter, { time: 180000 });

                channelCollector.on('collect', (channelResponseMessage) => {
                    const channelInput = channelResponseMessage.content.trim();

                    if (channelInput.toUpperCase() === 'NO') {
                        dmChannel.send('Channel ID setup cancelled.');
                        channelCollector.stop();
                        channelSetupInProgress.delete(guildID);
                        channelSetsArray = channelSetsArray.filter((set) => set !== channelSetupInProgress);
                        reject(new Error('Channel ID setup cancelled.'));
                    } else {
                        const channel = guild.channels.cache.get(channelInput);

                        if (!channel) {
                            dmChannel.send('Invalid channel ID. Please try again.');
                        } else {
                            serverData[guildID].reaction_channel_id = channelInput;
                            saveServerData(serverData);

                            SendReactionEmbed(guild, channel, serverData[guildID].role_id);

                            message.reply('Reaction channel ID has been set up for the bot.');

                            channelCollector.stop();
                            resolve();
                        }
                    }
                });

                channelCollector.on('end', (collected, reason) => {
                    if (reason === 'time') {
                        console.log(`No response received for guild ${guildID}`);
                        message.reply('Channel ID setup cancelled.');
                        channelSetupInProgress.delete(guildID);
                        channelSetsArray = channelSetsArray.filter((set) => set !== channelSetupInProgress);
                        reject(new Error('No response received for channel ID setup.'));
                    }
                });
            })
            .catch((error) => {
                console.error(`Error sending DM to admin for guild ${guildID}:`, error);
                message.reply('An error occurred while setting up the channel ID. Please try again later.');
                channelSetupInProgress.delete(guildID);
                channelSetsArray = channelSetsArray.filter((set) => set !== channelSetupInProgress);
                reject(error);
            });
    });
}

async function SendReactionEmbed(guild, channel, role_id, is_already_sent) {
    // arguments are cached, avoids fetching server data for nothing
    const serverData = getServerData();
    const channelId = serverData[guild.id].reaction_channel_id;
    const messageId = serverData[guild.id].reactionMessage_id;

    if (!role_id || role_id == null) {
        role_id = getServerData()[guild.id].role_id
    }

    let role = guild.roles.cache.find(role => role.id === role_id);
    let sentMessage = null

    if (!is_already_sent) {
        const embed = new EmbedBuilder()
            .setTitle('React to get the alert role')
            .setAuthor({
                name: client.user.tag + " is active on " + guild.name,
                iconURL: client.user.displayAvatarURL()
            })
            .setDescription(`Click one of the reaction emojis below to get or remove the ***${role.name}*** role. You will be notified **every time** RUINTracker notices a change. You can react once every **5 minutes** to reduce computing power.`)
            .setColor("Blurple")
            .setFooter({ text: "@RUINTracker automated by DAF.", iconURL: client.user.displayAvatarURL() })

        sentMessage = await channel.send({ embeds: [embed] });
        sentMessage.react('👌');
        sentMessage.react('❌');

        if (!serverData[guild.id].reactionMessage_id || serverData[guild.id].reactionMessage_id == undefined) {
            serverData[guild.id].reactionMessage_id = sentMessage.id
            saveServerData(serverData)
        }

    } else if (serverData[guild.id] != undefined) {
        // for new db, sentMessage is never null, tho old servers may not have registered it

        if (sentMessage == null && messageId && channelId) {
            try {
                const channel = client.channels.cache.get(channelId);

                try {
                    const message = await channel.messages.fetch(messageId);

                    if (channel && message) {
                        sentMessage = message
                    } else {
                        throw error
                    }
                } catch (err) {
                    console.log("An error occured. Probably a forced deleted message. DiscordAPIError[10008]: Unknown Message")

                    sentMessage = null
                    serverData[guild.id].reactionMessage_id = null
                    saveServerData(serverData)
                    
                    channel.send(FetchingErrorMSG.replace("{}", "REACTION_CHANNEL").replace("[]", "?rt/setReactionID"))
                }
            } catch (err) {
                console.log("An error occured. Probably a forced deleted channel.")

                serverData[guild.id].reaction_channel_id = null
                saveServerData(serverData)
            }
        }
    }

    if (!role || role === null) {
        // check if role hasnt been removed. 
        console.log("An error occured. Probably a forced deleted role. DiscordAPIError[10008]: Unknown role")
        const channel = client.channels.cache.get(channelId);

        try {
            const message = await channel.messages.fetch(messageId);

            if (channel && message) {
                sentMessage = message
            }
        } catch (err) {
            console.log("An error occured. Probably a forced deleted channel. DiscordAPIError[10008]: Unknown channel")

            sentMessage = null
            serverData[guild.id].role_id = null
            saveServerData(serverData)

            if (channel) {
                channel.send(FetchingErrorMSG.replace("{}", "**REACTION_ROLE_ID**").replace("[]", "?rt/setRoleID"))
            }
        }
    }

    if (sentMessage != null && role && role != null) {
        const filter = (reaction, user) => reaction.emoji.name === '👌' || reaction.emoji.name === '❌' && !user.bot;
        const collector = sentMessage.createReactionCollector({ filter });

        collector.on('collect', (reaction, user) => {
            if (!reactionCooldown.has(user.id)) {
                reactionCooldown.add(user.id);

                setTimeout(() => {
                    reactionCooldown.delete(user.id);
                }, timeoutDuration);

                if (user != client.user) {
                    if (reaction.emoji.name === '👌') {
                        const role = guild.roles.cache.find(role => role.id === role_id);
                        const member = guild.members.cache.get(user.id);

                        if (role && member) {
                            try {
                                member.roles.add(role)
                                    .then(() => {
                                        console.log(`Assigned role ${role.name} to ${user.tag} in guild ${guild.name}`);
                                        user.send(`You've been granted the role **${role.name}** in guild **${guild.name}**`);
                                    })
                                    .catch(console.error);
                            }
                            catch (err) {
                                console.log(err)
                            }
                        }

                    } else if (reaction.emoji.name === '❌') {
                        const role = guild.roles.cache.find(role => role.id === role_id);
                        const member = guild.members.cache.get(user.id);
                        if (role && member) {
                            try {
                                member.roles.remove(role)
                                    .then(() => {
                                        console.log(`Removed role ${role.name} to ${user.tag} in guild ${guild.name}`);
                                        user.send(`Your role **${role.name}** has been removed in guild **${guild.name}**`);
                                    })
                                    .catch(console.error);
                            } catch (err) {
                                console.log(err)
                            }
                        }
                    }
                }
            }
        });

        collector.on('end', () => {
            console.log('Reaction collector ended');
        });

        return collector

    }
}

// client.login(process.env.TOKEN_ID)

client.on('ready', async () => {
    console.log(`${client.user.tag.toString()} is ready!`);

    client.guilds.fetch();
    const serverData = getServerData();

    for (const guild of client.guilds.cache.values()) {
        if (
            serverData[guild.id] &&
            serverData[guild.id].reaction_channel_id !== undefined &&
            serverData[guild.id].reactionMessage_id !== undefined
        ) {
            await SendReactionEmbed(guild, null, null, true);
        }
    }

    for (const [cachedGuild, Data] of Object.entries(serverData)) {
        if (!client.guilds.cache.get(cachedGuild)) {
            DeleteDataForGuild(cachedGuild)
        }
    }
});

client.on('messageCreate', async (message) => {
    const guild = message.guild;
    if (!guild) return;

    const member = message.member;
    const guildID = guild.id;

    // TODO: Change from else if to a mor ergonomic setup
    if (message.content.toLowerCase().startsWith('?rt/setup')) {
        if (!member || !member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('You need to have administrator permissions to execute this command.');
        }

        let serverData = getServerData();
        let channelSetupInProgress = channelSetsArray.find((set) => set.has(guildID));

        if ((!serverData[guildID] || (serverData[guildID] != undefined && serverData[guildID].role_id == null)) && !channelSetupInProgress) {
            channelSetupInProgress = new Set();

            channelSetsArray.push(channelSetupInProgress);
            channelSetupInProgress.add(guildID);

            try {
                const admin = message.author;
                const dmChannel = await admin.createDM();

                serverData = await AskForChannelID(message, serverData, admin, dmChannel, channelSetupInProgress, guildID)
                    .then(async () => {
                        await AskForRoleID(message, serverData, admin, dmChannel, channelSetupInProgress, guildID, guild)
                            .then(async () => {
                                await AskForReactionChannelID(message, serverData, admin, dmChannel, channelSetupInProgress, guildID, guild)
                                    .then(() => {
                                        // All setup actions completed successfully
                                    })
                                    .catch((error) => {
                                        console.log('An error occurred during the reaction channel ID setup:', error);
                                    });
                            })
                            .catch((error) => {
                                console.log('An error occurred during the role ID setup:', error);
                            });
                    })
                    .catch((error) => {
                        console.log('An error occurred during the channel ID setup:', error);
                    });
            } catch (error) {
                console.error(`Error creating DM channel for guild ${guildID}:`, error);
                message.reply('An error occurred while setting up the channel ID. Please try again later.');
                channelSetupInProgress.delete(guildID);
                channelSetsArray = channelSetsArray.filter((set) => set !== channelSetupInProgress);
            }
        } else {
            message.reply('The channel ID is already set up for this server, or a config is already running.');
        }
    } else if (message.content.toLowerCase().startsWith('?rt/resetguild')) {
        if (!member || !member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('You need to have administrator permissions to execute this command.');
        }

        const guildID = message.guild.id;
        const _BCallback = await DeleteDataForGuild(guildID)

        if (_BCallback) {
            return message.reply('Server data has been reset. All previous messages should be cleared (except for notifications). You can restart the server configuration by typing ?RT/Setup');
        } else {
            return message.reply('No server data found for the guild.');
        }
    } else if (message.content.toLowerCase().startsWith('?rt/setroleid')) {
        if (!member || !member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('You need to have administrator permissions to execute this command.');
        }
        let serverData = getServerData();
        let channelSetupInProgress = channelSetsArray.find((set) => set.has(guildID));

        if (((serverData[guildID] != undefined && serverData[guildID].role_id == null)) && !channelSetupInProgress) {
            try {
                const serverData = getServerData();

                const admin = message.author;
                const dmChannel = await admin.createDM();

                await AskForRoleID(message, serverData, admin, dmChannel, channelSetupInProgress, guildID, guild)
            } catch (error) {
                console.error(`Error creating DM channel for guild ${guildID}:`, error);
                message.reply('An error occurred while setting up the channel ID. Please try again later.');
                channelSetupInProgress.delete(guildID);
                channelSetsArray = channelSetsArray.filter((set) => set !== channelSetupInProgress);
            }
        }

    } else if (message.content.toLowerCase().startsWith('?rt/setreactionid')) {
        if (!member || !member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('You need to have administrator permissions to execute this command.');
        }

        let serverData = getServerData();
        let channelSetupInProgress = channelSetsArray.find((set) => set.has(guildID));

        if (((serverData[guildID] != undefined && serverData[guildID].reactionMessage_id == null)) && !channelSetupInProgress) {
            try {
                const serverData = getServerData();

                const admin = message.author;
                const dmChannel = await admin.createDM();

                await AskForReactionChannelID(message, serverData, admin, dmChannel, channelSetupInProgress, guildID, guild)
            } catch (error) {
                console.error(`Error creating DM channel for guild ${guildID}:`, error);
                message.reply('An error occurred while setting up the channel ID. Please try again later.');
                channelSetupInProgress.delete(guildID);
                channelSetsArray = channelSetsArray.filter((set) => set !== channelSetupInProgress);
            }
        }
    }

});
/*
client.on('messageDelete', async (message) => {
    console.log(message.author.id === client.user.id)

    if (message.author.id === client.user.id) {
        let serverData = getServerData()
        if (serverData[message.guildId] && serverData[message.guildId].reaction_channel_id && serverData[message.guildId].reaction_channel_id == message.id) {
            // check if the data exists first and if the message deleted is woroth executing at
            serverData[message.guildId].reactionMessage_id = null 
            
            saveServerData(serverData)

            // Prevent that happening again by sending a message to the one who deleted it.
            let logs = await message.guild.fetchAuditLogs({type: 72}) // 72: MESSAGE_DELETE (https://discord.com/developers/docs/resources/audit-log)
            let entry = logs.entries.first()

            console.log(entry)

            if (!entry.executor.bot) {
                try {
                    entry.executor.dmChannel.send(FetchingErrorMSG.replace("{}", "REACTION_CHANNEL").replace("[]", "?rt/setReactionID"))
                } catch (err) {
                    console.log(err)
                }
            }
        }
    }
})
*/
client.on('guildDelete', (guild) => {
    if (guild) {
        console.log(guild + " was just deleted. Removing existing data...")

        DeleteDataForGuild(guild.id)
    }
});


export const db_name = "DiscordBot"
export const db_description = "Discord implementation of the ruintracker"

