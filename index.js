require('dotenv').config()
const express = require('express')
const ejs = require('ejs')
const session = require('express-session')
const _ = require('lodash')
const mongoose = require('mongoose')
const passport = require('passport')
const GoogleStrategy = require('passport-google-oauth20').Strategy

mongoose.connect(process.env.URI)

const userSchema = mongoose.Schema({
    fullName: String,
    googleID: String,
    currentDate: Date,
    targets: Array,
    track: Array
})

const Users = mongoose.model('User', userSchema)

app.set('view engine', 'ejs')
app.use(express.static('public'))
app.use(express.urlencoded({extended: false}))
app.use(session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false,
    maxAge: 86400000
}))

app.use(passport.initialize());
app.use(passport.session());
passport.serializeUser((user, done)=>done(null, user))
passport.deserializeUser(async(user, done)=>{
    const foundUser = await Users.find({_id: user._id})
    done(null, foundUser[0])
})

passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: process.env.CALLBACK_URL
}, async (accessToken, refreshToken, profile, cb) => {
    const foundUser = await Users.find({ googleID: profile.id })
    if (foundUser.length == 0) {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        const sampleTargets = []
        for (let i = 0; i < days.length; i++) {
            sampleTargets.push({day: days[i], calories: 2500})
        }
        const newUser = new Users({fullName: profile.displayName, googleID: profile.id, targets: sampleTargets, track: []})
        await newUser.save()
        cb(null, newUser)
    } else {
        cb(null, foundUser[0])
    }
}))

app.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        res.redirect('/diary')
    } else {
        res.render('enter')
    }
})

app.get('/auth/google', passport.authenticate('google', { scope: ["profile"] }))

app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }), (req, res) => res.redirect('/diary'))

app.get('/logout', (req, res) => {
    req.logOut((err)=>err ? console.log(err) : null)
    res.redirect('/')
})

app.listen(8000, () => {
    console.log('Server running on port 8000')
})