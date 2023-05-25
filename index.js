require('dotenv').config()
const express = require('express')
const app = express()
const ejs = require('ejs')
const session = require('express-session')
const axios = require('axios')
const _ = require('lodash')
const mongoose = require('mongoose')
const passport = require('passport')
const GoogleStrategy = require('passport-google-oauth20').Strategy

const isToday = require('date-fns/isToday')
const getDay = require('date-fns/getDay')

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
    callbackURL: 'http://localhost:3000/auth/google/callback'
}, async (accessToken, refreshToken, profile, cb) => {
    const foundUser = await Users.find({ googleID: profile.id })
    if (foundUser.length == 0) {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        const sampleTargets = []
        for (let i = 0; i < days.length; i++) {
            sampleTargets.push({day: days[i], calories: 2500})
        }
        const newUser = new Users({fullName: profile.displayName, googleID: profile.id, currentDate: new Date(), targets: sampleTargets, track: [{calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0}]})
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

app.get('/diary', async (req, res) => {
    if (req.isAuthenticated()) {
        if (!isToday(req.user.currentDate)) {
            const newData = req.user
            newData.currentDate = new Date()
            if (newData.track.length > 1) {
                newData.track = [{calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0}]
            }
            const updatedUser = await Users.findOneAndUpdate({_id: newData._id}, newData)
            req.user = updatedUser
        }
        res.render('diary', {data: processUserData(req.user)})
    } else {
        res.redirect('/')
    }
})

app.get('/user', (req, res) => {
    if (req.isAuthenticated()) {
        res.render('user', {user: req.user})
    } else {
        res.redirect('/')
    }
})

app.post('/targets', async (req, res) => {
    const formData = req.body
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    let newTargets = []
    for (let i = 0; i < days.length; i++) {
        newTargets.push({day: days[i], calories: Number(formData[i])})
    }
    const newData = req.user
    if (newData.targets !== newTargets) {
        newData.targets = newTargets
        const updatedUser = await Users.findOneAndUpdate({_id: newData._id}, newData)
        req.user = updatedUser
    }
    res.redirect('/diary')
})

app.get('/add', (req, res) => {
    if (req.isAuthenticated()) {
        res.render('add')
    } else {
        res.redirect('/')
    }
})

app.post('/add', async (req, res) => {
    const { data } = await axios({
        method: 'GET',
        url: 'https://api.api-ninjas.com/v1/nutrition?query='+req.body.food,
        headers: {
            'X-Api-Key': process.env.API_KEY
        }
    })
    const newUser = req.user
    newUser.track.push({name: req.body.food, cal: Math.round(data[0].calories)})
    newUser.track[0]['calories'] += Math.round(data[0].calories)
    newUser.track[0]['protein'] += Math.round(data[0].protein_g)
    newUser.track[0]['carbs'] += Math.round(data[0].carbohydrates_total_g)
    newUser.track[0]['fat'] += Math.round(data[0].fat_total_g)
    newUser.track[0]['fiber'] += Math.round(data[0].fiber_g)
    const updatedUser = await Users.findOneAndUpdate({_id: newUser._id}, newUser)
    req.user = updatedUser
    res.redirect('/diary')
})

function processUserData(user) {
    const obj = {user, calorieMsg: ''}
    const calorieTargetForToday = user.targets[getDay(user.currentDate)].calories
    const calories = obj.user.track[0].calories
    if (calories > calorieTargetForToday) {
        obj.calorieMsg = `${calories-calorieTargetForToday}kcal over target today!`
    } else {
        obj.calorieMsg = `${calorieTargetForToday-calories}kcal remaining today`
    }
    return obj
}

app.listen(3000, () => {
    console.log('Server running on port 3000')
})