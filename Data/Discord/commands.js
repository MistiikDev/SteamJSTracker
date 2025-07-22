import dotenv from 'dotenv';
import fs from 'fs';
import schedule from 'node-schedule'
import { REST, Routes } from 'discord.js'
dotenv.config();

const commands = [
    {
        name: 'Server Setup',
        description: 'Setup RUINTracker for the server'
    }
]

const rest = new REST({version: "10"}).setToken(process.env.TOKEN_ID)

(async() => {
    try {
        await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, ))
    } catch (error) {
        console.log("There was an error: ", error)
    }
})