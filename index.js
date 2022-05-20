const express = require('express')
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, Collection } = require('mongodb');
require('dotenv').config()
const app = express();
const port = process.env.PORT || 5000

app.use(cors());
app.use(express.json());

function verifyJWT(req, res, next){
  const authorization = req.headers.authorization;
  if(!authorization){
    return res.status(401).send({message: 'Unauthorized access'})
  }
  const token = authorization.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function(err, decoded) {
    if(err){
      return res.status(403).send({message: 'Forbidden access'})
    } 
    req.decoded = decoded;
    next();
  });
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tbwjp.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try{
        await client.connect();
        const serviceCollection = client.db("doctors_protal").collection("services");
        const bookingCollection = client.db("doctors_protal").collection("booking");
        const userCollection = client.db("doctors_protal").collection("user");
        const doctorsCollection = client.db("doctors_protal").collection("doctors");

        // multipule middle ware
        const verifyAdmin = async (req, res, next) => {
          const requester = req.decoded.email;
          const requesterAccount = await userCollection.findOne({email: requester});
          // console.log(requesterAccount);
          if(requesterAccount.role === "admin"){
            next();
          }else{
            return res.status(403).send({message: 'Forbidden access'})
          }
        }

        app.get('/service', async (req, res) => {
          const query = {};
          const cursor = serviceCollection.find(query);
          const services = await cursor.toArray();
          res.send(services);
        })

        app.get('/available', async (req, res) => {
          const date = req.query.date;

          // step: 1 get all service
          const services = await serviceCollection.find().toArray();

          // step: 2 get the booking of that day
          const query = {date: date};
          const bookings = await bookingCollection.find(query).toArray();

          // for each service, find booking for that service
          services.forEach(service => {
            const serviceBookings = bookings.filter(b => b.treatment === service.name);
            const booked = serviceBookings.map(s => s.slot);
            const available = service.slots.filter(s => !booked.includes(s));
            service.slots = available;
          })
          res.send(services);

        })

        app.get('/booking', verifyJWT, async (req, res) => {
          const patient = req.query.patient
          const decodedEmail = req.decoded.email;
          if(patient === decodedEmail){
            const query = {email: patient};
            console.log(query)
            const bookings = await bookingCollection.find(query).toArray();
            res.send(bookings)
          }else{
            return res.status(403).send({message: 'Forbidden access'})
          }
        })

        app.get('/user', verifyJWT, async (req, res) => {
          const doctors = await userCollection.find().toArray();
          res.send(doctors);
        })

        app.get('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
          const result = await doctorsCollection.find().toArray();
          res.send(result);
        });

        app.get('/admin/:email', async (req, res) => {
          const email = req.params.email;
          const user = await userCollection.findOne({email: email});
          const isAdmin = user.role === "admin"
          res.send({admin: isAdmin});
        })

        // Delete method
        app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
          const email = req.params.email;
          const filter = {email: email}
          const result = await doctorsCollection.deleteOne(filter);
          res.send(result);
        })

        // post method
        app.post('/booking', async (req, res) => {
          const booking = req.body;
          const query = {treatment: booking.treatment, date: booking.date, patient: booking.email};
          const exists = await bookingCollection.findOne(query);
          if(exists){
            return res.send({success: false, booking: exists})
          } 
          const result = await bookingCollection.insertOne(booking);
          return res.send({success: true, result}); 
        })

        app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
          const doctor = req.body;
          const result = await doctorsCollection.insertOne(doctor);
          res.send(result);
        })

        // put method
        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
          const email = req.params.email;
            const filter = {email: email};
            const updateDoc = {
              $set: {role: "admin"}
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result)
        })

        app.put('/user/:email', async (req, res) => {
          const email = req.params.email;
          const user = req.body;
          const filter = {email: email};
          const options = { upsert: true };
          const updateDoc = {
            $set: user,
          };
          const result = await userCollection.updateOne(filter, updateDoc, options);
          const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
          res.send({result, token})
        })

    }finally{

    }
}

run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Doctors Portal app listening on port ${port}`)
})