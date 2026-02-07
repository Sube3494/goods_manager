"use client";

import { motion } from "framer-motion";

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, filter: "blur(10px)" }}
      animate={{ opacity: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, filter: "blur(10px)" }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} // Custom cubic-bezier for "Apple-like" smooth finish
    >
      {children}
    </motion.div>
  );
}
