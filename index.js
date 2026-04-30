// server.js
const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

/// 📍 DISTANCE
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

app.post("/send-alert", async (req, res) => {
  try {
    const request = req.body;

    console.log("🔥 Request:", request);

    const usersSnapshot = await db.collection("users").get();

    let sent = 0;

    for (const doc of usersSnapshot.docs) {
      const user = doc.data();

      const hasToken = !!user.fcmToken;
      const hasLocation = user.lat != null && user.lng != null;
      const bloodMatch = user.bloodGroup === request.bloodGroup;

      console.log(doc.id, { hasToken, hasLocation, bloodMatch });

      if (!hasToken || !hasLocation) continue;
      if (!bloodMatch) continue;

      const distance = getDistance(
        user.lat,
        user.lng,
        request.lat,
        request.lng
      );

      if (distance > 50) continue;

      try {
        await admin.messaging().send({
          token: user.fcmToken,
          data: {
            bloodGroup: request.bloodGroup,
            location: request.location,
            phone: request.phone || "9999999999",
          },
          android: { priority: "high" },
        });

        console.log(`✅ Sent to ${doc.id}`);
        sent++;
      } catch (e) {
        console.log(`❌ Failed ${doc.id}`, e.message);
      }
    }

    console.log("TOTAL SENT:", sent);
    res.json({ success: true, sent });
  } catch (e) {
    console.log(e);
    res.status(500).send("Error");
  }
});

app.listen(3000, () => console.log("🚀 Server running"));