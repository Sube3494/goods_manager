const fs = require("fs");
const path = require("path");

const filesToDelete = [
    "/uploads/gallery/0146844f294082c6124a8043dc16dcbd86451.jpg",
    "/uploads/gallery/0c8f49aa2f827162a4a34b444f9257d1216163.jpg",
    "/uploads/gallery/2e016317d2848c4e90a2cd5d483c6067147822.jpg",
    "/uploads/gallery/30d8df83c604bad68baedfa92761b6c952267.jpg",
    "/uploads/gallery/329cc94df6468335ead3f4bb1efd0df182565.jpg",
    "/uploads/gallery/3df0896d36ff6a0a9e4c30b80354549483321.jpg",
    "/uploads/gallery/49009b3cd6a99bedf4ca79636fca1a9b176666.jpg",
    "/uploads/gallery/4a1e0a8a35a17e88b70d70c96fd66e32255136.jpg",
    "/uploads/gallery/5e7ca5a4cca277135c1b574e1aeb8c621067021.png",
    "/uploads/gallery/5f6073f2e683075faadd520f4035570266168.jpg",
    "/uploads/gallery/64afa4d460d020d3ea13a456f2aff8ac580600.jpg",
    "/uploads/gallery/789a9d8707ed434722627df1c9adc00e134438.jpg",
    "/uploads/gallery/8b1245ae64dfd1ed65cf743d7f79aee182566.jpg",
    "/uploads/gallery/a32a04a31dc91752b1fa7415b502185593456.jpg",
    "/uploads/gallery/aec13147fca79b4d7e5e6b92281cd2e4221602.jpg",
    "/uploads/gallery/b6dffacfbb989aa85636c64de0839503131507.jpg",
    "/uploads/gallery/b75f428a07fc6faf7adf637a77bfc2ef137440.jpg",
    "/uploads/gallery/bbd5c05e91c0b4c1caade1cec69d072e198712.jpg",
    "/uploads/gallery/c1ad47838b2000b6bb7c78ec52d782de63280.jpg",
    "/uploads/gallery/dcf941886aa8a51a5ffbdcb120f6802b110972.jpg",
    "/uploads/gallery/e2c983b4f6ad0087d79dd45116548002277578.jpg",
    "/uploads/gallery/e6cc27cf4ce021cf65586f3e781b4804142467.jpg",
    "/uploads/gallery/eb29c3314153aecb3b103bb7d25d9953113413.jpg",
    "/uploads/gallery/ec7dd6a3fbe2640a0c150453a54fd1e375267.jpg",
    "/uploads/gallery/ee300aa0c06b6f10c4d4af886cb261cc187509.jpg",
    "/uploads/gallery/fa7cb752a2a3e8ae07e9a5fad3418475136471.jpg",
    "/uploads/gallery/fecb55975de6cb9106bb07b6a566fc2a69461.jpg"
];

const publicDir = path.join(process.cwd(), "public");

filesToDelete.forEach(f => {
    const fullPath = path.join(publicDir, f);
    if (fs.existsSync(fullPath)) {
        try {
            fs.unlinkSync(fullPath);
            console.log(`Deleted: ${f}`);
        } catch (e) {
            console.error(`Failed to delete ${f}:`, e.message);
        }
    } else {
        console.warn(`File not found: ${f}`);
    }
});

console.log("\nCleanup complete.");
