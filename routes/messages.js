var express = require("express");
var router = express.Router();
let { checkLogin } = require('../utils/authHandler.js.js')
let messageModel = require("../schemas/messages");
const mongoose = require("mongoose");

// GET / - lấy message cuối cùng của mỗi user mà user hiện tại nhắn tin hoặc user khác nhắn cho user hiện tại
router.get("/", checkLogin, async function (req, res, next) {
    try {
        let currentUserId = new mongoose.Types.ObjectId(req.userId);
        
        let latestMessages = await messageModel.aggregate([
            {
                $match: {
                    $or: [
                        { from: currentUserId },
                        { to: currentUserId }
                    ],
                    isDeleted: false
                }
            },
            {
                $sort: { createdAt: -1 }
            },
            {
                $group: {
                    _id: {
                        $cond: {
                            if: { $eq: ["$from", currentUserId] },
                            then: "$to",
                            else: "$from"
                        }
                    },
                    latestMessage: { $first: "$$ROOT" }
                }
            },
            {
                $replaceRoot: { newRoot: "$latestMessage" }
            },
            {
                $sort: { createdAt: -1 }
            }
        ]);
        
        let result = await messageModel.populate(latestMessages, [
            { path: 'from', select: 'username email avatarUrl fullName' },
            { path: 'to', select: 'username email avatarUrl fullName' }
        ]);

        res.send(result);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

// GET /:userID - lấy toàn toàn bộ message from: user hiện tại, to: userID và from: userID và to: user hiện tại
router.get("/:userID", checkLogin, async function (req, res, next) {
    try {
        let currentUserId = req.userId;
        let targetUserId = req.params.userID;

        let messages = await messageModel.find({
            $or: [
                { from: currentUserId, to: targetUserId },
                { from: targetUserId, to: currentUserId }
            ],
            isDeleted: false
        })
        .sort({ createdAt: 1 })
        .populate('from', 'username email avatarUrl fullName')
        .populate('to', 'username email avatarUrl fullName');

        res.send(messages);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

const multer = require('multer');
const path = require('path');
let storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        let ext = path.extname(file.originalname)
        let fileName = Date.now() + "-" + Math.round(Math.random() * 1000_000_000) + ext;
        cb(null, fileName)
    }
});
let upload = multer({ storage: storage });

// POST / - post nội dung
router.post("/", checkLogin, upload.single('file'), async function (req, res, next) {
    try {
        let currentUserId = req.userId;
        let to = req.body.to;
        let type;
        let text;
        
        if (req.file) {
            type = 'file';
            text = req.file.path;
        } else {
            type = 'text';
            text = req.body.text;
        }

        if (!to) {
            return res.status(400).send({ message: "Missing required field: to" });
        }
        
        if (type === 'text' && !text) {
             return res.status(400).send({ message: "Missing required field: text (when no file uploaded)" });
        }

        let newMessage = new messageModel({
            from: currentUserId,
            to: to,
            messageContent: {
                type: type,
                text: text
            }
        });

        let savedMessage = await newMessage.save();
        savedMessage = await savedMessage.populate([
            { path: 'from', select: 'username email avatarUrl fullName' },
            { path: 'to', select: 'username email avatarUrl fullName' }
        ]);

        res.status(201).send(savedMessage);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

module.exports = router;
