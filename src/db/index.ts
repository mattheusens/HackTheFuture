import mongoose from "mongoose";

export async function intitateMongoDb() {
  try {
    const mongoUri = Bun.env.MONGO || "mongodb://localhost:27017";
    const res = await mongoose.connect(mongoUri, {
      dbName: "fishDB"
    });
    console.log(
      `Connected to mongodb on: ${mongoUri}`
    );
    return res;
  } catch (err) {
    throw new Error("Unable to connect to mongoDB: " + err);
  }
}