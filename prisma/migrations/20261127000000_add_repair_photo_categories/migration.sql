-- PostgreSQL enum additions must commit before the values can be used in DML.
ALTER TYPE "RepairPhotoCategory" ADD VALUE 'MOVEMENT_DISASSEMBLED';
ALTER TYPE "RepairPhotoCategory" ADD VALUE 'FAULT_DETAIL';
