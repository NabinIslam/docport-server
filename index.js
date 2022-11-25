const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
var jwt = require('jsonwebtoken');

const port = process.env.PORT || 5000;

const app = express();

// middlewares
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.lqyancf.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

// jwt token varify
function varifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send('Unauthorized access');
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: 'forbidden access' });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    const appointmentOptionsCollection = client
      .db('docport')
      .collection('appointmentOptions');
    const bookingsCollection = client.db('docport').collection('bookings');
    const usersCollection = client.db('docport').collection('users');
    const doctorsCollection = client.db('docport').collection('doctors');

    const varifyAdmin = (req, res, next) => {
      console.log('inside varifyAdmin', req.decoded.email);
      next();
    };

    // appointoption api
    app.get('/appointment-options', async (req, res) => {
      const date = req.query.date;

      const appointmentOptions = await appointmentOptionsCollection
        .find({})
        .toArray();
      const bookingQuery = { appointmentDate: date };
      const alreadyBooked = await bookingsCollection
        .find(bookingQuery)
        .toArray();
      appointmentOptions.map(option => {
        const optionBooked = alreadyBooked.filter(
          book => book.treatment === option.name
        );

        const bookedSlots = optionBooked.map(book => book.slot);
        const remainingSlots = option.slots.filter(
          slot => !bookedSlots.includes(slot)
        );
        option.slots = remainingSlots;
      });
      res.send(appointmentOptions);
    });

    app.get('/bookings', varifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;

      if (email !== decodedEmail) {
        return res.status(403).send({ message: 'forbidden access' });
      }

      const bookings = await bookingsCollection
        .find({ email: email })
        .toArray();
      res.send(bookings);
    });

    app.get('/booking/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const booking = await bookingsCollection.findOne(query);

      res.send(booking);
    });

    app.post('/bookings', async (req, res) => {
      const booking = req.body;

      const query = {
        appointmentDate: booking.appointmentDate,
        email: booking.email,
        treatment: booking.treatment,
      };

      const alreadyBooked = await bookingsCollection.find(query).toArray();

      if (alreadyBooked.length) {
        const message = `You already have a bookig on ${booking.appointmentDate}`;
        return res.send({ acknowledged: false, message });
      }

      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

    app.get('/jwt', async (req, res) => {
      const email = req.query.email;
      const user = await usersCollection.findOne({ email: email });
      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
          expiresIn: '1h',
        });
        return res.send({ accessToken: token });
      }

      res.status(4.3).send({ accessToken: '' });
    });

    app.get('/users', async (req, res) => {
      const users = await usersCollection.find({}).toArray();
      res.send(users);
    });

    app.get('/user/admin/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ isAdmin: user?.role === 'admin' });
    });

    app.post('/users', async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.put('/user/admin/:id', varifyJWT, async (req, res) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await usersCollection.findOne(query);
      if (user?.role !== 'admin') {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const updatedDoc = {
        $set: {
          role: 'admin',
        },
      };
      const result = await usersCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(result);
    });

    app.get('/specialties', async (req, res) => {
      const result = await appointmentOptionsCollection
        .find({})
        .project({ name: 1 })
        .toArray();
      res.send(result);
    });

    // app.get('/add-price', async (req, res) => {
    //   const filter = {};
    //   const options = { upsert: true };
    //   const updatedDoc = {
    //     $set: {
    //       price: 99,
    //     },
    //   };
    //   const result = await appointmentOptionsCollection.updateMany(
    //     filter,
    //     updatedDoc,
    //     options
    //   );
    //   res.send(result);
    // });

    app.post('/doctors', varifyJWT, async (req, res) => {
      const doctor = req.body;
      const result = await doctorsCollection.insertOne(doctor);

      res.send(result);
    });

    app.get('/doctors', varifyJWT, varifyAdmin, async (req, res) => {
      const doctors = await doctorsCollection.find({}).toArray();
      res.send(doctors);
    });

    app.delete('/doctor/:id', varifyJWT, async (req, res) => {
      const id = req.params.id;
      const result = await doctorsCollection.deleteOne({ _id: ObjectId(id) });
      res.send(result);
    });
  } finally {
  }
}

run().catch(err => console.error(err));

app.get('/', async (req, res) => {
  res.send('docport server is running');
});

app.listen(port, () => console.log(`docport running on ${port}`));
