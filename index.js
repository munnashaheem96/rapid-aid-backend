const express = require("express");
const admin = require("firebase-admin");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 🔥 USE ENV VARIABLE (RENDER)
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// 📍 Distance function
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// 🚨 MAIN API
app.post("/send-alert", async (req, res) => {
  try {
    const request = req.body;

    const usersSnapshot = await db.collection("users").get();

    let sent = 0;

    for (const doc of usersSnapshot.docs) {
      const user = doc.data();

      if (!user.fcmToken) continue;
      if (user.bloodGroup !== request.bloodGroup) continue;

      const distance = getDistance(
        user.lat,
        user.lng,
        request.lat,
        request.lng
      );

      if (distance > 20) continue;

      await admin.messaging().send({
        token: user.fcmToken,
        notification: {
          title: "🚨 Emergency Blood Request",
          body: `${request.bloodGroup} needed near ${request.location}`,
        },
        data: {
          bloodGroup: request.bloodGroup,
          location: request.location,
        },
      });

      sent++;
    }

    res.json({ success: true, sent });
  } catch (err) {
    console.log(err);
    res.status(500).send("Error sending alerts");
  }
});

// 🔥 IMPORTANT FOR RENDER (PORT FIX)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));